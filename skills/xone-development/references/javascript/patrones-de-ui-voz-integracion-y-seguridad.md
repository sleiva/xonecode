# XOne — Patrones de UI, voz, integración y seguridad

> Fuente: `xone/v2/xone-help-docs/topics/05-events-patterns-faq.md` §11–§13. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §11 patrones de UI · §11A control por voz (TTS + STT) · §12 patrones de integración · §13 patrones de seguridad

---

## 11. Patrones de UI

### 11.1 Formulario con validación

```javascript
function validarFormulario() {
    if (!self.MAP_NOMBRE || self.MAP_NOMBRE.length == 0) {
        ui.showToast("El nombre es obligatorio");
        return false;
    }
    if (!self.MAP_EMAIL || self.MAP_EMAIL.length == 0) {
        ui.showToast("El email es obligatorio");
        return false;
    }
    return true;
}

function guardarFormulario() {
    if (!validarFormulario()) return;
    self.save();
    ui.showToast("Guardado correctamente");
    ui.getView(self).exit();
}
```

### 11.2 Tarjeta de información (Card)

```xml
<frame name="frmCard" width="96%" height="auto" lmargin="2%"
       tmargin="10p" bgcolor="#FFFFFF" border-corner-radius="12"
       framebox="true" forecolor="#E0E0E0" border-width="1">
    <frame name="frmCardHeader" width="100%" height="48p" bgcolor="#F5F5F5">
        <prop name="lblCardTitulo" type="L" visible="7"
              width="100%" height="48p" lmargin="16p"
              fontsize="16" fontbold="true" forecolor="#212121"
              title="Título de la Tarjeta"/>
    </frame>
    <prop name="lblCardContenido" type="L" visible="7"
          width="96%" lmargin="2%" tmargin="12p" bmargin="12p"
          forecolor="#757575" fontsize="14" label-wrap="true"
          title="Contenido de la tarjeta con descripción detallada"/>
</frame>
```

### 11.3 Dashboard con estadisticas

```xml
<frame name="frmDashboard" width="100%" scroll="true">
    <!-- Fila de estadisticas -->
    <frame name="frmStats" width="96%" lmargin="2%" tmargin="10p">
        <frame name="frmStat1" width="31%" height="100p"
               bgcolor="#E3F2FD" border-corner-radius="8">
            <prop name="lblStatNum1" type="L" visible="7"
                  width="100%" align="center" tmargin="15p"
                  fontsize="24" fontbold="true" forecolor="#1565C0"
                  title="##FLD_MAP_TOTAL_PENDIENTES##"/>
            <prop name="lblStatLabel1" type="L" visible="7"
                  width="100%" align="center"
                  fontsize="12" forecolor="#1565C0"
                  title="Pendientes"/>
        </frame>
        <frame name="frmStat2" width="31%" height="100p"
               lmargin="3%" newline="false"
               bgcolor="#E8F5E9" border-corner-radius="8">
            <prop name="lblStatNum2" type="L" visible="7"
                  width="100%" align="center" tmargin="15p"
                  fontsize="24" fontbold="true" forecolor="#2E7D32"
                  title="##FLD_MAP_TOTAL_COMPLETADOS##"/>
            <prop name="lblStatLabel2" type="L" visible="7"
                  width="100%" align="center"
                  fontsize="12" forecolor="#2E7D32"
                  title="Completados"/>
        </frame>
    </frame>
</frame>
```

### 11.4 Item de lista con icono + textos

```xml
<!-- Dentro de la coleccion del content (visible="4" para modo lista) -->
<group name="General" id="1">
    <prop name="IMAGEN" type="IMG" width="115p" height="118p"
          visible="4" tmargin="2p" lmargin="0"/>
    <frame name="frm1" newline="false" width="600p" lmargin="5p" height="120p">
        <prop name="MAP_NOMBRE_GRID" type="T" class="classgrid"/>
        <prop name="MAP_DIRECCION_GRID" class="classgrid" type="T"
              text-forecolor="#666666" textfont-size="5"
              lines="2" fixed-lines="true"/>
    </frame>
</group>
```

### 11.5 Botón flotante (FAB)

```xml
<frame name="floatadd1" top="920p" left="510p"
       width="290p" height="90p" floating="true">
    <prop name="BTADD1" type="B" visible="1" labelwidth="0"
          method="ExecuteNode(nuevo)" width="75p"
          img="add.png" imgsel="add_click.png"/>
</frame>
```

### 11.6 Modal/Overlay

```xml
<frame name="frmnuevochat"
       animation-in-delay="250" animation-out-delay="250"
       animation-in="##RIGHT_IN##" animation-out="##LEFT_OUT##"
       disablevisible="MAP_VERFLOTANTE=0"
       bgcolor="#ffffff" modal="true" floating="true"
       top="0" left="0" width="100%" height="100%">
    <!-- Contenido del modal -->
    <prop name="MAP_BUSCAR_USUARIO"
          ontextchanged="javascript:AccionesChatEspecial('textoU', e);"
          type="T" visible="1"/>
    <prop name="@nUsuarios" contents="nUsuarios" viewmode="recyclerview"
          type="Z" visible="1" width="100%" height="1061p"/>
    <contents name="nUsuarios" src="UsuariosChat"/>
</frame>
```

### 11.7 Barra de busqueda

```xml
<frame name="frmBuscador" width="98%" lmargin="1%" height="150p"
       tmargin="1%" framebox="true">
    <prop name="MAP_BUSCAR_TEXT"
          ontextchanged="javascript:FiltraMarcados(e);"
          labelwidth="0" text-border="true" type="T"
          lpadding="10p" rpadding="10p"
          width="98%" tmargin="10p" lmargin="1%" height="60p"
          tooltip="Texto a buscar"/>
</frame>
```

### 11.8 Badge de notificación

```xml
<!-- Usar un L con fondo circular como badge -->
<frame name="frmBadge" floating="true" top="10p" left="80p"
       width="24p" height="24p" disablevisible="MAP_NOTIF_COUNT=0">
    <prop name="lblBadge" type="L" visible="7"
          width="24p" height="24p" align="center"
          bgcolor="#FF0000" forecolor="#FFFFFF" fontsize="10"
          border-corner-radius="12"
          title="##FLD_MAP_NOTIF_COUNT##"/>
</frame>
```

### 11.9 Slider de imágenes

```xml
<prop name="ContentsDatosSlide" viewmode="slideview"
      autoslide-delay="5" type="Z"
      width="100%" lmargin="0" height="1160p"
      contents="ContentsDatosSlide"
      onchange="refresh255" forceonchange="true"/>
<contents name="ContentsDatosSlide" src="ContentsDatosSlide"/>
```

### 11.10 Vista de chat (burbujas)

**Ejemplo real** (del proyecto EspecialChat):

```xml
<frame name="frmChatear" tmargin="0" width="100%" height="937p"
       imgbk="##FLD_MAP_FOTO_FONDO##">
    <frame name="frmContent" tmargin="0" width="100%" height="937p">
        <prop name="Chatear" bgcolor="#00000000" contents="Chatear"
              edit-inrow="true" type="Z" width="100%" height="100%"/>
        <contents name="Chatear" src="Chatear"
                  filter="IDCHAT=##FLD_MAP_CHATSEL##"/>
    </frame>
</frame>

<!-- Barra inferior con input y botones -->
<frame name="frmMenuW" bgcolor="#ffffff" align="center"
       width="100%" height="100p">
    <prop name="MAP_ADDOTHER" img="icon_more.png" type="B"
          width="100p" height="100p"/>
    <prop name="MAP_TITLE"
          onfocuschanged="javascript:AccionesChatEspecial('foco', e);"
          ontextchanged="javascript:AccionesChatEspecial('textoChange', e);"
          type="T" visible="1" newline="false"
          width="424p" height="80p" tmargin="10p"/>
    <prop name="MAP_ADDTEXT"
          method="executenode(AccionesChatEspecial('enviar'))"
          img="icon_send.png" type="B" width="100p" height="100p"
          newline="false" disablevisible="MAP_SHOWADDTEXT=0"/>
</frame>
```

---

## 11A. Patron Control por Voz (TTS + STT)

XOne soporta síntesis de voz (Text-to-Speech) y reconocimiento de voz (Speech-to-Text) nativamente a traves del objeto global `ui`, combinando dos métodos:

- `ui.speak({...})` — el dispositivo "habla" un texto.
- `ui.recognizeSpeech({...})` — el dispositivo "escucha" y te entrega el texto reconocido.

El patron más potente es **encadenar ambos**: hablar primero (pregunta al usuario) y, cuando termine la síntesis, arrancar la escucha (respuesta del usuario). Así se evita que el reconocedor capte la propia voz sintetizada.

### 11A.1 Anatomia de los parámetros

**`ui.speak(params)`**

| Parámetro | Descripción |
| --- | --- |
| `language` | Idioma: `"es"`, `"en"`, ... |
| `text` | Texto que se va a pronunciar. |
| `speechRate` | Ritmo de habla en milisegundos. |
| `onCompleted` | Callback `function()` al terminar de hablar. |

**`ui.recognizeSpeech(params)`**

| Parámetro | Descripción |
| --- | --- |
| `language` | Idioma del reconocedor. |
| `timeoutAfterSilence` | Milisegundos de silencio antes de cerrar la escucha. |
| `characterLimit` | *(Opcional)* Número máximo de caracteres a reconocer. |
| `onRecognize` | `function(sText)` con el texto reconocido. |
| `onError` | `function(nErrorCode, sError)` si hubo error. |
| `onPartialResults` | *(Opcional)* `function(extras)` con resultados parciales. |
| `onEndOfSpeech` | *(Opcional)* `function()` al terminar la locucion del usuario. |

### 11A.2 Patron "preguntar y escuchar" (flujo completo)

```xml
<!-- Botón que lanza la interacción por voz -->
<prop name="MAP_BT_VOZ" type="B" visible="1" title="Preguntar por voz"
      onclick="doSpeakYRecoger('es', '¿Que opción quieres?', self, null);" />

<!-- Icono del micrófono (cambia según el estado) -->
<prop name="MAP_IMGLISTENING" type="IMG" visible="1" width="64p" height="64p"/>
```

```javascript
// Funcion 1: habla la pregunta y encadena la escucha cuando termina el TTS
function doSpeakYRecoger(sLanguage, strText, objSource, objAR) {
    ui.speak({
        language   : sLanguage,
        text       : strText,
        speechRate : 120,
        onCompleted: function() {
            // Cuando el dispositivo ha terminado de hablar, arrancamos el reconocedor.
            // Así el microfono no capta la propia voz sintetizada.
            objSource.MAP_IMGLISTENING = "microRojo.png";   // indicar "escuchando"
            ui.refresh("MAP_IMGLISTENING");
            doRecognize(sLanguage, objSource, objAR);
        }
    });
}

// Funcion 2: escucha, procesa, actualiza UI
function doRecognize(sLanguage, objSource, objAR) {
    ui.recognizeSpeech({
        language: sLanguage,
        timeoutAfterSilence: 10000,

        onRecognize: function(sText) {
            sText = (sText || "").toUpperCase();

            // Caso A: comparar contra opciones predefinidas
            if (objSource.MAP_INITAR == 1 && objAR != null) {
                let idx = 100;
                if      (objAR.MAP_TITLE0.toUpperCase() == sText) idx = 0;
                else if (objAR.MAP_TITLE1.toUpperCase() == sText) idx = 1;
                else if (objAR.MAP_TITLE2.toUpperCase() == sText) idx = 2;
                // ...aquí harias algo con idx...
            } else {
                // Caso B: volcar el texto reconocido en una propiedad
                objSource.MAP_TEXT = sText;
                ui.refreshValue("MAP_TEXT");
            }
        },

        onError: function(nErrorCode, sError) {
            objSource.MAP_IMGLISTENING = "microGris.png";   // restaurar icono
            ui.refresh("MAP_IMGLISTENING");
            // ui.msgBox("Error " + nErrorCode + ": " + sError, "Voz", 0);
        },

        onEndOfSpeech: function() {
            // Restaurar icono al terminar la locucion (aunque el reconocedor
            // aún este procesando). onRecognize se llama después.
            objSource.MAP_IMGLISTENING = "microGris.png";
            ui.refresh("MAP_IMGLISTENING");
        }
    });
}
```

### 11A.3 Solo escuchar (sin TTS previo)

Si solo quieres dictado, se puede usar `recognizeSpeech` directamente, sin `speak`:

```javascript
function dictarNota() {
    ui.recognizeSpeech({
        language: "es",
        timeoutAfterSilence: 10000,
        onRecognize: function(sText) {
            self.MAP_NOTA = sText;
            ui.refreshValue("MAP_NOTA");
        },
        onError: function(nErrorCode, sError) {
            ui.showToast("Error de voz: " + sError);
        }
    });
}
```

### 11A.4 Buenas prácticas

- **Siempre** lanzar `recognizeSpeech` desde `onCompleted` de `speak`, nunca antes — evita que el reconocedor oiga la síntesis.
- Gestionar el icono del microfono con una propiedad tipo `MAP_IMGLISTENING` y refrescarla en cada transición de estado (hablando / escuchando / inactivo).
- Para comparar lo dictado con opciones predefinidas, normalizar siempre con `.toUpperCase()` (o `.toLowerCase()`) antes de comparar.
- `timeoutAfterSilence` en ms — valores típicos 5000-10000. Más bajo corta frases largas; más alto introduce latencia.
- El `onError` **siempre** debe restaurar el estado visual del microfono.

### 11A.5 Referencias

- Doc del wiki: `2.-desarrollo-app/2.5.-controles-by-xone/control_por_voz/start.md`
- Referencia de los métodos (objetos complementarios): `ui.speak` y `ui.recognizeSpeech` en la documentación del objeto global `ui`.

---

## 12. Patrones de Integración

### 12.1 Conexión con API REST

```javascript
function consultarAPI(endpoint) {
    var miObjeto = self; // Guardar contexto
    ui.showWaitDialog("Consultando...");

    var request = {
        parameters: {
            connectTimeout: 120000,
            readTimeout: 120000
        },
        headers: {
            "Authorization": "Bearer " + appData.getGlobalMacro("##TOKEN##"),
            "Accept": "application/json"
        }
    };

    $http.get("https://api.ejemplo.com/" + endpoint, request,
        function(sData, headers, nHttpStatusCode) {
            var json = JSON.parse(sData);
            miObjeto.MAP_RESULTADO = json.resultado;
            ui.refresh("MAP_RESULTADO");
            ui.hideWaitDialog();
        },
        function(nError, sErrorDesc) {
            ui.showToast("Error " + nError + ": " + sErrorDesc);
            ui.hideWaitDialog();
        }
    );
}
```

> **Referencia cruzada:** Para la API HTTP completa (`$http`), consultar el tópico 03 sobre la API JavaScript.

### 12.2 GPS y seguimiento en tiempo real

**Iniciar GPS (ejemplo real de EspecialMapa):**

```javascript
var ok = ui.msgBox("Desea acceder al Geoposicionamiento?", "Aviso", 4);
if (ok == 6) {
    appData.getCurrentEnterprise().setVariable("MIUBICACION", 1);
}
if (appData.getCurrentEnterprise().getVariable("MIUBICACION") == 1) {
    ui.startGps();
    PosicionamientoGPS();
}
```

**GPS con callback:**

```javascript
ui.startGps({
    nodeName: "callbackGPS",
    timeBetweenUpdates: 10000,
    minimumMetersDistanceRange: 10,
    foreground: true,
    title: "Mi App GPS",
    text: "Rastreando ubicación..."
});
```

### 12.3 Camara: captura de fotos

```xml
<prop name="MAP_FOTO" type="PH" img-width="48p" img-height="48p"
      height="40%" title="Foto" lmargin="2%"/>
```

La captura se lanza automáticamente al tocar el control `PH`. Para foto de solo lectura:

```xml
<prop name="MAP_FOTOVER" type="PH" locked="true"
      height="40%" title="foto" lmargin="2%"/>
```

### 12.4 Escaneo QR/Barcode

```javascript
ui.scanBarCode({
    onScanned: function(sCode) {
        self.MAP_CODIGO_QR = sCode;
        ui.refresh("MAP_CODIGO_QR");
        ui.showToast("Código: " + sCode);
    },
    onCancelled: function() {
        ui.showToast("Escaneo cancelado");
    }
});
```

### 12.5 Firma digital

```xml
<prop name="MAP_SIGNATURE" img-width="48p" img-height="48p"
      type="DR" readonly="false" height="40%" title="Firma"
      stroke-width="##FLD_MAP_TAMANO_TRAZO##"
      stroke-color="##FLD_MAP_COLOR_TRAZO##"
      bgcolor="##FLD_MAP_COLOR_FONDO##"
      apply-format-to-file="true"
      onchange="refresh(MAP_SIGNATURE)"/>
```

### 12.6 Calendario con eventos

**Ejemplo real** (del proyecto EspecialCalendario):

```xml
<frame name="calendario" width="100%" height="350p">
    <prop name="Calendario" type="Z" calendar-viewmode="week"
          contents="calendario" width="100%" height="100%"
          viewmode="calendarview"
          onchange="refresh" postonchange="refresh"/>
    <contents name="calendario" src="ContentdatosCalendario"/>
</frame>

<!-- Lista de eventos del mes -->
<frame name="calendario2" width="100%" height="360p">
    <prop name="Calendariodatos" type="Z" contents="Calendariodatos"
          width="100%" height="300p"/>
    <contents name="Calendariodatos" src="ContentdatosCalendariolista"
              filter="strftime('%m',##FLD_MAP_FECHA##)=strftime('%m',FECHA)
                      and strftime('%Y',##FLD_MAP_FECHA##)=strftime('%Y',FECHA)"/>
</frame>
```

### 12.7 Gráficos (pie, bar, line)

**Ejemplo real** (del proyecto EspecialGraficos):

```xml
<!-- Gráfico de barras -->
<prop name="@GraficosBarrasDatos" classid="XOneCharts"
      viewmode="barchart" type="Z" contents="GraficosBarrasDatos"
      width="692p" height="500p"/>
<contents name="GraficosBarrasDatos" src="ContentGraficosBarrasDatos"/>

<!-- Gráfico circular -->
<prop name="@GraficosPastelDatos" classid="XOneCharts"
      viewmode="piechart" type="Z" contents="GraficosPastelDatos"
      width="692p" height="500p"/>

<!-- Gráfico de línea de tiempo -->
<prop name="@GraficosLineasTiempoDatos" classid="XOneCharts"
      viewmode="timeserieschart" type="Z"
      contents="GraficosLineasTiempoDatos"
      width="692p" height="500p"/>

<!-- Gráfico de lineas -->
<prop name="@GraficosLineasDatos" classid="XOneCharts"
      viewmode="linechart" type="Z" contents="GraficosLineasDatos"
      width="692p" height="500p"/>
<contents name="GraficosLineasDatos" src="ContentGraficosLineasDatos"
          sort="CATEGORIA,VALOR1,VALOR2,VALOR3"/>

<!-- Gráfico XY -->
<prop name="@GraficosLineasXYDatos" classid="XOneCharts"
      viewmode="xylinechart" type="Z" contents="GraficosLineasXYDatos"
      width="692p" height="500p"/>
```

**ViewModes de gráficos disponibles:**

| viewmode | Descripción |
|----------|-------------|
| `barchart` | Gráfico de barras |
| `3dbarchart` | Gráfico de barras 3D |
| `piechart` | Gráfico circular tipo 1 |
| `piechart2` | Gráfico circular tipo 2 |
| `linechart` | Gráfico de lineas |
| `timeserieschart` | Gráfico de series temporales |
| `xylinechart` | Gráfico de lineas XY |

### 12.8 Mapas con marcadores

**Ejemplo real** (del proyecto EspecialMapa):

```xml
<prop name="MAP_mapa" width="100%" title="Mapa" height="80%"
      type="Z" visible="1" viewmode="mapview"
      mapview-embedded="true" contents="mapaDatos"/>
<contents name="mapaDatos" src="ContentmapaDatos"/>

<prop name="boton0it" type="B" title="showStreetView"
      onclick="javascript:showStreetView('MAP_mapa');"/>
<prop name="boton1it" type="B" title="showMap"
      onclick="javascript:showMap('MAP_mapa');" newline="false"/>
```

### 12.9 Notificaciones push

**Crear notificación local (ejemplo real de EspecialNotificaciones):**

```javascript
ui.showNotification(1, "Titulo", "Esto es una notificación",
    "Aviso de recepcion de datos");

// Eliminar notificación
ui.dismissNotification("1");
```

**Notificación avanzada con botones:**

```javascript
ui.showNotification({
    id: 5000,
    title: "Nueva tarea asignada",
    text: "Tiene una nueva tarea pendiente",
    icon: "app_icon1",
    backgroundColor: "#1976D2",
    sound: "notification.wav",
    cancelable: true,
    dataObject: self,
    nodeName: "callbackNotificacion",
    parameters: '{ "tareaId": "123" }',
    buttons: [{
        id: 5001,
        title: "Responder",
        directReply: true,
        directReplyLabel: "Escriba su respuesta...",
        dataObject: self,
        nodeName: "respuestaCallback"
    }]
});
```

### 12.10 Sincronización con servidor

La sincronización se configura en el nodo `maintenance` de `Empresas`:

```xml
<maintenance>
    <action name="Replica" type="replica"
            frecuency="400" period="X" synchronize="true"/>
    <action name="SincronizarDatos" type="runscript"
            period="S" frecuency="600" auto="true" show="false">
        <script language="javascript">
            sincronizarConServidor();
        </script>
    </action>
</maintenance>
```

---

## 13. Patrones de Seguridad

### 13.1 Login seguro

```javascript
function realizarLogin() {
    if (!validarRequerido(self.MAP_EMAIL, "Email")) return;
    if (!validarRequerido(self.MAP_PASSWORD, "Contraseña")) return;

    ui.showWaitDialog("Iniciando sesion...");

    var collUsuarios = appData.getCollection("Usuarios");
    var usuario = collUsuarios.findObject(
        "LOGIN = '" + self.MAP_EMAIL + "'"
    );

    ui.hideWaitDialog();

    if (usuario) {
        // Verificar contraseña (idealmente hasheada)
        if (usuario.PWD == self.MAP_PASSWORD) {
            appData.setGlobalMacro("##USERID##", usuario.ID);
            appData.setGlobalMacro("##USERNAME##", usuario.NOMBRE);
            ui.showToast("Bienvenido, " + usuario.NOMBRE);
            ui.openEditView("MenuPrincipal");
        } else {
            ui.showToast("Credenciales incorrectas");
        }
    } else {
        ui.showToast("Usuario no encontrado");
    }
}
```

### 13.2 Validación de entrada

```javascript
function validarRequerido(valor, nombre) {
    if (!valor || valor.toString().length == 0) {
        ui.showToast("El campo " + nombre + " es obligatorio");
        return false;
    }
    return true;
}

function validarEmail(email) {
    if (!email) return false;
    return email.indexOf("@") > 0 && email.indexOf(".") > 0;
}

function validarNumeroPositivo(valor, nombre) {
    if (isNaN(valor) || valor <= 0) {
        ui.showToast(nombre + " debe ser un número positivo");
        return false;
    }
    return true;
}
```

### 13.3 SQL parameterizado

Para evitar inyeccion SQL al construir filtros:

```javascript
// INCORRECTO - vulnerable a inyeccion SQL
coll.setFilter("NOMBRE = '" + self.MAP_BUSCAR + "'");

// MEJOR - sanitizar la entrada
var busqueda = self.MAP_BUSCAR.toString().replace(/'/g, "''");
coll.setFilter("NOMBRE LIKE '%" + busqueda + "%'");
```

### 13.4 Encriptación de datos sensibles

```javascript
// Hashear con SHA-256
var hash = crypto.sha256("texto a hashear");

// Cifrar con AES
var cifrado = crypto.encrypt("texto", "clave_secreta", "AES");

// Descifrar
var original = crypto.decrypt(cifrado, "clave_secreta", "AES");

// Base64
var encoded = crypto.encodeBase64("texto");
var decoded = crypto.decodeBase64(encoded);
```

### 13.5 Timeout de sesión

```javascript
// Configurar timeout usando maintenance
// En Empresas (mappings.xne):
// <maintenance>
//     <action name="VerificarSesion" type="runscript"
//             period="S" frecuency="300" auto="true" show="false">
//         <script language="javascript">
//             verificarTimeoutSesion();
//         </script>
//     </action>
// </maintenance>

function verificarTimeoutSesion() {
    var ultimaActividad = appData.getGlobalMacro("##ULTIMA_ACTIVIDAD##");
    var ahora = new Date().getTime();
    var diferencia = ahora - parseInt(ultimaActividad);
    // 30 minutos = 1800000 ms
    if (diferencia > 1800000) {
        ui.showToast("Sesion expirada");
        appData.logout();
    }
}
```

