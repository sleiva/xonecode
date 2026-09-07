# Subir y bajar ficheros del dispositivo, y aplicar los cambios (HTTP)

Referencia LITERAL de los endpoints `/file_upload` y `/file_download` del servidor hotswap
embebido, del túnel por adb y de las dos trampas de reemplazar una base de datos; copiada de
la documentación del framework, no reescrita.

Los comandos WebSocket del mismo servidor: [comandos.md](comandos.md).

## 1. Endpoint genérico de subida de ficheros

```
PUT|POST /file_upload?file=<rutaRelativa>[&appName=<nombreApp>]
```

- **Método:** `PUT` o `POST` (cualquier otro → `405 Method Not Allowed`).
- **Body:** los bytes crudos del fichero (sin multipart, sin form-encoding).
- **`Content-Length`:** **obligatorio**. Sin él → `411 Length Required`. Se lee exactamente
  `Content-Length` bytes del cuerpo; si llegan menos → `400 Bad Request`.

### Parámetros de query

| Parámetro | Obligatorio | Descripción |
|---|---|---|
| `file` | Sí | Ruta **relativa** del fichero destino, resuelta contra el directorio de datos de la app (p. ej. `/data/data/com.xone.android.framework`). |
| `appName` | Solo para `debug_app_update.zip` | Nombre de la app. Ver sección 2. |

### Reglas y seguridad

- La raíz de resolución es el **directorio de datos** de la aplicación.
- **No se admiten rutas absolutas** (`file=/etc/...`) → `403 Forbidden`.
- **Protección anti path-traversal:** el destino debe quedar dentro del directorio de datos;
  si `..` se sale → `403 Forbidden`.
- Si el destino es un directorio existente → `409 Conflict`.
- Los directorios padre que falten se crean automáticamente.
- **Sobrescribe siempre** el fichero destino si ya existe.
- **Escritura atómica:** un fallo durante la subida no deja un fichero a medias en el destino.
- **Límite de tamaño:** `512 MiB`. Si `Content-Length` lo supera → `413 Payload Too Large`.
- Respuesta correcta: `200 OK` con cuerpo de texto `OK`.

### Ejemplo (fichero suelto)

```bash
# Subir un XML concreto dentro del directorio de la app ya instalada
# -k acepta el certificado autofirmado del servidor (ver sección 3)
curl -k -X PUT --data-binary @objects.xml \
  "https://127.0.0.1:8443/file_upload?file=app_miapp/objects.xml"
```

> `curl --data-binary @fichero` calcula y envía `Content-Length` automáticamente.

### Ejemplo (PowerShell)

```powershell
# -SkipCertificateCheck equivale al -k de curl (certificado autofirmado, ver sección 3)
Invoke-WebRequest -Method Put -InFile .\objects.xml -SkipCertificateCheck `
  -Uri "https://127.0.0.1:8443/file_upload?file=app_miapp/objects.xml"
```

> `Invoke-WebRequest -InFile` también calcula el `Content-Length` por su cuenta.

---

## 2. Subir una aplicación completa (`debug_app_update.zip`)

Este es el mecanismo para desplegar/actualizar **una app XOne entera** de golpe: se empaqueta
el contenido de la aplicación en un ZIP y se sube; el servidor lo descomprime en el directorio
de la app.

```
PUT|POST /file_upload?file=debug_app_update.zip&appName=<nombreApp>
```

El comportamiento especial se dispara **únicamente** cuando el nombre del fichero destino es
**exactamente** `debug_app_update.zip`:

1. **`appName` pasa a ser obligatorio.** Si falta → `400 Bad Request` y se descarta el ZIP subido.
2. El directorio de extracción es **`app_<appName-en-minúsculas>`** dentro del directorio de
   datos (el `appName` se baja a minúsculas).
3. Se valida que ese directorio quede dentro del directorio de datos; si no → `403 Forbidden`.
4. Si el directorio no existe, se crea.
5. Se descomprime el ZIP en él. Si la extracción falla → `500` y se descarta el ZIP.
6. **El ZIP se elimina siempre al terminar**, tanto en éxito como en fallo de extracción.
7. Tras una extracción correcta, la app **aparece o se actualiza en la lista de aplicaciones**
   de la pantalla del servidor hotswap.
8. Respuesta correcta: `200 OK` / `OK`.

> **El ZIP no limpia el directorio de destino.** La extracción añade y sobrescribe, pero no
> borra lo que ya hubiera en `app_<appName>`. Para un despliegue desde cero hay que vaciar
> el directorio antes (o borrar los datos de la app).

> **Subir no aplica nada por sí solo.** El proceso de la app ya tiene cargado en memoria lo
> que hubiera antes; hay que reiniciarla para que lea lo subido. Ver sección 5.

### Ejemplo (app completa)

```bash
# 1) Empaquetar la app en un ZIP llamado EXACTAMENTE debug_app_update.zip
#    (el contenido del ZIP es lo que irá dentro de app_miapp)

# 2) Subirlo indicando appName
curl -k -X POST --data-binary @debug_app_update.zip \
  "https://127.0.0.1:8443/file_upload?file=debug_app_update.zip&appName=MiApp"
# → se descomprime en app_miapp y la app aparece en la lista
```

---

## 3. Entorno de pruebas: dispositivo por ADB

Lo habitual al probar es tener el dispositivo (o emulador) **conectado por ADB**. El servidor
hotswap escucha en el **puerto 8443 por defecto**, en `localhost` del dispositivo. Para
alcanzarlo desde el PC se usa un **`adb forward`**:

```bash
# Reenvía el puerto 8443 del PC → puerto 8443 del dispositivo
adb forward tcp:8443 tcp:8443
```

A partir de ahí, la **IP de destino es `127.0.0.1`** (localhost del PC, que ADB tuneliza al
dispositivo):

```bash
curl -k -X POST --data-binary @debug_app_update.zip \
  "https://127.0.0.1:8443/file_upload?file=debug_app_update.zip&appName=MiApp"
```

### Si el puerto no está abierto (lanzar el servidor)

El servidor hotswap se arranca junto con el proceso de la app y **solo en builds _debuggable_**.
Si el puerto no responde (conexión rechazada), normalmente es porque el proceso de la app no está
vivo. Lanzar la pantalla del servidor hotswap con `am start` arranca el proceso de la app —y con
él el servidor— además de mostrar el estado de conexión (IP y puerto). Es una activity exportada:

```bash
# Flavor standalone (com.xone.android.framework)
adb shell am start -n com.xone.android.framework/com.xone.android.hotswap.activities.SetupActivity

# Flavor playStoreDeveloper (com.xone.android.developer.framework)
adb shell am start -n com.xone.android.developer.framework/com.xone.android.hotswap.activities.SetupActivity
```

Una vez arrancado, (re)aplica el `adb forward` y reintenta la petición HTTP.

### Notas sobre el puerto y SSL

- **El puerto puede cambiar.** Si 8443 está ocupado (p. ej. hay otra APK de framework
  instalada), el servidor elige el siguiente puerto libre. El puerto real se ve en la pantalla
  del servidor hotswap (pestaña **Información**, campo de puerto, y en la barra superior que
  muestra IP:puerto). Ajusta el `adb forward` al puerto real:
  `adb forward tcp:<localPort> tcp:<puertoDelDispositivo>`.
- **HTTPS y certificado autofirmado.** Por defecto el servidor escucha en **HTTPS** (SSL/TLS),
  por lo que todas las URLs usan `https://`. El certificado es **autofirmado**, así que hay que
  aceptarlo explícitamente o la conexión TLS será rechazada:
  - Con `curl`: añade `-k` (`--insecure`) para saltarte la validación del certificado.
  - Desde un navegador: acepta la advertencia de certificado.
  - Solo si se desactiva la conexión segura en la configuración del servidor, este escucha en
    `http://` (y entonces no hace falta `-k`).
- Con varios dispositivos conectados, especifica cuál: `adb -s <serial> forward tcp:8443 tcp:8443`.
- Para deshacer el reenvío: `adb forward --remove tcp:8443` (o `--remove-all`).

---

## 4. Descargar ficheros (`/file_download`)

El camino inverso: recuperar del dispositivo un fichero de una app ya instalada.

```
GET /file_download?appName=<nombreApp>&file=<rutaRelativa>
```

| Parámetro | Obligatorio | Descripción |
|---|---|---|
| `appName` | **Sí, siempre** | Nombre de la app. Se busca su directorio dentro del directorio de datos. |
| `file` | Sí | Ruta **relativa al directorio de la app**. |

> **Ojo: la raíz NO es la misma que en la subida.** En `/file_upload` la ruta se resuelve
> contra el **directorio de datos** (por eso hay que escribir `file=app_miapp/objects.xml`);
> en `/file_download` se resuelve contra el **directorio de la app** que indica `appName`,
> así que la misma ruta se pide como `file=objects.xml`. Aquí `appName` es obligatorio
> siempre, no solo para el ZIP.

Reglas:

- Misma protección anti path-traversal: el destino debe quedar dentro del directorio de la app.
- Si falta cualquiera de los dos parámetros, la app no existe, el fichero no existe o no es un
  fichero regular → **`404 Not Found`** (respuesta HTML, no texto plano).
- Respuesta correcta: `200 OK` con los bytes del fichero.

### Caso especial: ficheros `.db`

Si el nombre del fichero **termina en `.db`**, no se devuelve el fichero suelto: se devuelve un
**ZIP** generado al vuelo que contiene:

- la propia base de datos,
- sus ficheros auxiliares `-shm`, `-wal` y `-journal`, los que existan en ese momento,
- y un fichero **`db.key`** con la **clave SQLCipher en claro**, en el formato `x'<hex>'` que
  espera un `PRAGMA key` (clave + salt concatenados). Solo se incluye si la base de datos
  está cifrada; si el cifrado de BD está desactivado o no hay `.key`, el ZIP no lo lleva.

> **Implicación de seguridad:** este endpoint entrega la clave de cifrado de la base de datos
> en claro a quien pueda alcanzarlo. En disco el `.key` está protegido con el almacén seguro
> del dispositivo, pero en el ZIP viaja descifrado. El servidor hotswap solo se arranca en
> builds *debuggable*, pero conviene no exponer el puerto fuera de `localhost` / del túnel ADB.

```bash
curl -k -o gestion.db.zip \
  "https://127.0.0.1:8443/file_download?appName=MiApp&file=bd/gestion.db"
```

---

## 5. Aplicar los cambios: reiniciar la app

Subir un fichero **no lo aplica**: el proceso de la app ya tiene cargado en memoria lo que
hubiera antes. Tras subir hay que reiniciarla:

```bash
adb shell am force-stop com.xone.android.framework
adb shell am start -n com.xone.android.framework/.mainEntry
```

El arranque no es inmediato (carga del proyecto, motor de scripting); conviene esperar unos
segundos antes de comprobar el resultado o capturar pantalla.

Para verificar que el fichero aterrizó donde se esperaba, en un build *debuggable*:

```bash
adb shell run-as com.xone.android.framework sh -c 'ls -l app_miapp/objects.xml'
```

---

## 6. Reemplazar una base de datos

Sustituir un `.db` tiene dos trampas que no da ningún código de error:

**1. Ninguna de las vías HTTP cierra las conexiones abiertas a la base de datos.** (Sí lo hace
la descarga por WebSocket, que llama a `DriverManager.disposeConnection()`; el endpoint HTTP
no.) Si se sube un `.db` con la app viva, la subida responde `200 OK` y el fichero se escribe,
pero el proceso sigue usando el descriptor anterior y los cambios no aparecen — o se pierden
cuando la app cierre y vuelque lo suyo. **Parar la app *antes* de subir la base de datos:**

```bash
adb shell am force-stop com.xone.android.framework
# ... ahora sí, subir el .db ...
adb shell am start -n com.xone.android.framework/.mainEntry
```

**2. Los `-wal` / `-shm` antiguos siguen ahí** y contienen transacciones de la base de datos
vieja. Hay que borrarlos tras reemplazarla, o la app arrancará con estado inconsistente:

```bash
adb shell run-as com.xone.android.framework sh -c 'rm -f app_miapp/bd/gestion.db-wal app_miapp/bd/gestion.db-shm'
```

**La base de datos va cifrada con SQLCipher.** La app no cifra una base de datos plana al
abrirla: espera encontrarla **ya cifrada con la clave que le corresponde** (y si falta el
`.key`, genera una nueva clave y espera la BD cifrada con *esa*). Subir una base de datos sin
cifrar termina en `SQLiteDatabaseCorruptException: database disk image is malformed (code 11)`.
Para editarla fuera del dispositivo: descargarla con `/file_download` (que entrega también el
`db.key`, ver sección 4), abrirla con esa clave, editar, y volver a subirla cifrada con la
misma clave.

---

## 7. Códigos de respuesta (resumen)

| Código | Situación |
|---|---|
| `200 OK` | Subida (y extracción, si aplica) o descarga correcta |
| `404 Not Found` | (`/file_download`) Falta `appName` o `file`, la app no existe, o el fichero no existe |
| `400 Bad Request` | Falta `file`, `Content-Length` inválido, body más corto de lo declarado, o falta `appName` con `debug_app_update.zip` |
| `403 Forbidden` | Ruta absoluta, path-traversal, o `appName` inválido |
| `405 Method Not Allowed` | Método distinto de PUT/POST |
| `409 Conflict` | El destino es un directorio |
| `411 Length Required` | Falta la cabecera `Content-Length` |
| `413 Payload Too Large` | El cuerpo supera 512 MiB |
| `500 Internal Server Error` | No se pudo crear el directorio, extraer, reemplazar o mover el fichero |
