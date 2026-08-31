# XOne — OAuth2 y réplica

> Fuente: `xone/v2/xone-help-docs/topics/03c-js-appdata-http.md` §6–§7. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §6 OAuth2: autenticación completa · §7 objeto replica: sincronización

---

## 6. OAuth2 - Autenticación OAuth

### 6.1 Autenticación OAuth2

```javascript
function doAuthLogin() {
    let strAuthorityUrl  = "https://auth.miservidor.com/identity";
    let strClientID      = "mi_client_id";
    let strClientSecret  = "mi_client_secret";
    let strPersistenceKey = "oauth_key";
    let strRedirectUri   = "com.miapp.oauth:/callback";

    new OAuth2().withOptions({
        authority     : strAuthorityUrl,
        clientID      : strClientID,
        clientSecret  : strClientSecret,
        scope         : "openid profile",
        responseType  : "code id_token",
        persistenceKey: strPersistenceKey,
        redirectUri   : strRedirectUri
    }).authenticate({
        onSuccess: function(result) {
            console.log("OAuth2 login exitoso");
            console.log(result);
            appData.setGlobalMacro("##OAUTH_TOKEN##", result.access_token);
        },
        onError: function(err) {
            console.log("OAuth2 error: " + err);
            ui.showToast("Error de autenticación");
        }
    });
}
```

### 6.2 OAuth2 Logout

```javascript
function doAuthLogout() {
    new OAuth2().withOptions({
        authority     : "https://auth.miservidor.com/identity",
        clientID      : "mi_client_id",
        clientSecret  : "mi_client_secret",
        scope         : "openid profile",
        persistenceKey: "oauth_key",
        responseType  : "code id_token",
        redirectUri   : "com.miapp.oauth:/callback"
    }).logout();
}
```

### 6.3 Configuración Completa

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `authority` | String | URL del servidor de autorización |
| `clientID` | String | ID del cliente OAuth2 |
| `clientSecret` | String | Secreto del cliente |
| `scope` | String | Ambitos solicitados ("openid profile") |
| `responseType` | String | Tipo de respuesta ("code id_token") |
| `persistenceKey` | String | Clave para persistir la sesión |
| `redirectUri` | String | URI de redirección (esquema de URL de la app) |

---

## 7. Objeto `replica` - Sincronización

El objeto global `replica` gestiona la replicación/sincronización de datos y ficheros entre el dispositivo y el servidor central. También permite imponer restricciones de replica (p.ej. solo wifi) y consultar el estado.

**Catálogo completo de métodos:**

| Método | Descripción |
| --- | --- |
| **start** | Iniciar el servicio de réplica. |
| **stop** | Detener la réplica. |
| **processReplicatorQueue** | Procesar cola pendiente del replicador. Acepta tres formas de argumento (NO un callback): el `LiveSecureProvisioningResponse` recibido en el evento `live`, un `string` con el nombre de la app (resuelve `gestion.db` automáticamente), o un `{databasePath, appName, taskId}`. Devuelve `boolean` (true = cola vacía / éxito). |
| **getLog** | Obtener log de la réplica. |
| **getDatabaseId** | Obtener ID de la base de datos. |
| **getHostname** | Obtener nombre de host del servidor. |
| **getLicense** | Obtener licencia. |
| **getMid** | Obtener MID (identificador del dispositivo). |
| **getRecordsPend** | Obtener registros pendientes de enviar. |
| **getRecordsRX** | Obtener registros RX (recibidos en la sesión actual). |
| **getRecordsTX** | Obtener registros TX (enviados en la sesión actual). |
| **getTotalRecordsRX** | Total registros RX desde el inicio. |
| **getTotalRecordsTX** | Total registros TX desde el inicio. |
| **setRestriction** | Ajustar una restricción de réplica (p.ej. solo wifi). |
| **clearRestrictions** | Quitar las restricciones actuales. |
| **clearAllRestrictions** | Quitar todas las restricciones. |

### 7.1 replica.processReplicatorQueue(arg)

El argumento NO es un callback. Es uno de:
- el objeto `LiveSecureProvisioningResponse` recibido en el evento `live` (forma típica);
- un `string` con el nombre de la app (resuelve internamente `gestion.db`);
- un objeto `{databasePath, appName, taskId}` con los tres datos manuales.

Devuelve `boolean` sincronamente. NO recibe función de progreso (cualquier callback se ignora silenciosamente).

```javascript
// Forma típica: usar el objeto recibido en el evento live
function sincronizar(liveResponse) {
    let bResult = replica.processReplicatorQueue(liveResponse);
    if (bResult) {
        ui.showToast("Sincronización completada");
    } else {
        ui.showToast("Error en sincronización");
    }
}

// Forma alternativa: solo nombre de app
let bResult = replica.processReplicatorQueue("MiApp");

replica.start();

if (appData.isReplicating()) {
    ui.showToast("Sincronización en curso...");
}
```

### 7.2 Flujo de Replica con sys-message

```javascript
// Funcion llamada por el evento sys-message de la coleccion Empresas
function sysMessage(codigo, message) {
    switch(codigo) {
        case 1000:
            // Actualización descargándose
            break;
        case 1001:
            // Actualización aplicada
            break;
        case 1002:
            // Todas las actualizaciones aplicadas
            break;
        case 1003:
            // Provisionamiento seguro: replicar y cerrar
            ui.msgBox("Se va a actualizar la BD. Se replicaran datos y cerrara la app.", "Mensaje", 0);
            let bResult = replica.processReplicatorQueue(message);   // 'message' es el liveResponse del sys-message
            if (bResult) {
                appData.exit();
            } else {
                ui.showToast("Error al procesar cola de salida. Reintente.");
            }
            break;
    }
}
```

