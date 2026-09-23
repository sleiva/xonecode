# Llegar al dispositivo, desplegar una app y aplicar los cambios

Las dos plataformas hacen lo mismo conceptualmente —subir los ficheros del proyecto, reiniciar,
mirar— pero **por caminos completamente distintos**, y ahí es donde se pierde más tiempo. Los
comandos, uno a uno: [comandos.md](comandos.md).

## 1. Llegar

### Android: `adb forward`

El servidor escucha en `localhost` del dispositivo. Para alcanzarlo desde el PC:

```bash
adb devices -l
adb forward tcp:8443 tcp:8443            # reaplicar tras cada reconexión o reinicio del demonio
```

A partir de ahí la IP de destino es **`127.0.0.1`** (el localhost del PC, que adb tuneliza).
Con varios dispositivos: `adb -s <serial> forward tcp:8443 tcp:8443`. Para deshacerlo:
`adb forward --remove tcp:8443`.

**El canal de los comandos es un WebSocket, y vive en `/hotswap`.** Medido el 16-sep-2026 contra
`com.xone.android.framework` **5.0.2.2dev** (flavor standalone, Android): `wss://127.0.0.1:8443/hotswap`
contesta `101`, mientras que `/`, `/ws` y `/api` contestan `400`. Y **el servidor habla primero**: al
abrir manda `{"command":"server_hello","protocol_version":3}`, así que el cliente ESPERA el saludo en
vez de provocarlo. En esta versión `POST /command` por HTTP da **404** — los comandos van por el
WebSocket—, y por eso el `curl` de más abajo es solo para iOS.

**Si el puerto no responde**, normalmente es que el proceso de la app no está vivo. Lanzar la
pantalla del servidor hotswap arranca la app —y con ella el servidor— y muestra IP y puerto:

```bash
# flavor standalone
adb shell am start -n com.xone.android.framework/com.xone.android.hotswap.activities.SetupActivity
# flavor playStoreDeveloper
adb shell am start -n com.xone.android.developer.framework/com.xone.android.hotswap.activities.SetupActivity
```

**El puerto puede cambiar.** Si 8443 está ocupado (otra APK del framework instalada), el
servidor coge el siguiente libre; el real se ve en la pestaña **Información** de esa pantalla.
Ajusta el forward: `adb forward tcp:<local> tcp:<remoto>`.

### iOS: sin túnel

**No hay `adb` ni nada equivalente, y no hace falta.** El simulador comparte la pila de red del
Mac, así que el servidor de la app es alcanzable en `localhost` directamente. En dispositivo
físico se llega por la **IP de la LAN** que muestra la propia app en su barra de conexión.

```bash
xcrun simctl list devices booted
xcrun simctl launch <UDID> es.xone.studioapp.swift     # arrancar el host levanta el servidor
curl -sk -X POST https://localhost:8443/command -d '{"command":"getAllElements","format":"xone"}'
```

El servidor solo lo levanta el runtime **en modo desarrollo**: en una app de producción no
existe, igual que en Android solo existe en builds *debuggable*.

### Las dos: TLS con certificado autofirmado

Todas las URLs son `https://`. Con `curl`, `-k` (`--insecure`); desde un navegador, aceptar la
advertencia. Solo si alguien desactiva la conexión segura escucha en `http://`.

## 2. Desplegar una app

### Android: un ZIP llamado exactamente `debug_app_update.zip`

```
PUT|POST /file_upload?file=debug_app_update.zip&appName=<nombreApp>
```

El comportamiento especial se dispara **solo** con ese nombre de fichero exacto:

1. `appName` pasa a ser **obligatorio** (si falta → `400` y se descarta el ZIP).
2. Se extrae en **`app_<appName-en-minúsculas>`** dentro del directorio de datos.
3. Si el directorio no existe, se crea; se valida que quede dentro del directorio de datos.
4. **El ZIP se elimina siempre al terminar**, tanto en éxito como en fallo de extracción.
5. Tras una extracción correcta, la app aparece o se actualiza en la lista.

```bash
curl -k -X POST --data-binary @debug_app_update.zip \
  "https://127.0.0.1:8443/file_upload?file=debug_app_update.zip&appName=MiApp"
```

> **El ZIP no limpia el destino.** La extracción añade y sobrescribe, pero no borra lo que ya
> hubiera en `app_<appName>`. Para un despliegue desde cero, vaciar el directorio antes.

### iOS: copiar la carpeta al contenedor

**No hay `/file_upload`.** El host lee las apps de `<DataContainer>/Documents/<appName>/`, y
**solo aparecen las carpetas que tienen `app.ini`** (no basta `app.xml`). El `name=` del
`app.ini` es el `appName` con el que se lanza.

```bash
C=$(xcrun simctl get_app_container <UDID> es.xone.studioapp.swift data)
ditto ruta/a/MiApp "$C/Documents/MiApp"
xcrun simctl terminate <UDID> es.xone.studioapp.swift
xcrun simctl launch    <UDID> es.xone.studioapp.swift
```

El **terminate + launch** no es opcional: la lista de apps se construye en `viewDidLoad`, así que
un `launch` sobre una app ya viva solo la trae a primer plano y no refresca la lista.

Y ojo con el coste si hay un modelo LiteRT-LM (~2,4 GB) en el contenedor: copiarlo en cada
redespliegue es lo que convierte una iteración de segundos en una de minutos.

## 3. Lanzar la app XONE

En las dos plataformas es un comando, y el nombre va en **camelCase**:
`{"command":"launchApplication","appName":"<nombre>"}`. Medido el 16-sep-2026 contra 5.0.2.2dev: con
la minúscula contesta `Unknown command: launchapplication` y con esta grafía `{"result":true,"status":""}`.

> **`result: true` no significa «arrancó»: significa «aceptado».** El framework acusa el lanzamiento y
> no espera a que la app cargue. Medido: a un proyecto al que le falta el fichero que declara su
> `connstring` en `app.xml` (`bd/gestion.db`) le contesta `true` y la app muere en un diálogo «Error
> opening database / Database not found». Lo que dice si está VIVA es un comando de lectura:
> `getAllElements` contesta `App is not running` y `getScreenshot` `No activity is visible`. Es la
> misma regla que ««Terminó bien» y «ya está» son dos cosas»: la medida manda sobre el acuse.

**En iOS este comando es legado y va solo por WebSocket** — los manejadores legados responden
escribiendo en el socket, que en una petición HTTP no existe. Por HTTP, `/command` sirve solo los
comandos de automatización —los de los bloques **Ver la pantalla** y **Tocar**—, y con un legado
contesta `Unknown command '<x>'`; cuál es cuál lo dice la columna **Canal (iOS)** de la
[matriz de disponibilidad](comandos.md#matriz-de-disponibilidad). Lanzar la app en iOS pide,
por tanto, un cliente WebSocket — y no un `POST /command`.

## 4. Aplicar los cambios: reiniciar

Subir un fichero **no lo aplica**: el proceso tiene cargado en memoria lo de antes.

```bash
# Android
adb shell am force-stop com.xone.android.framework
adb shell am start -n com.xone.android.framework/.mainEntry

# iOS
xcrun simctl terminate <UDID> es.xone.studioapp.swift
xcrun simctl launch    <UDID> es.xone.studioapp.swift
```

El arranque no es inmediato (carga del proyecto, motor de scripting). Espera al control que marca
la pantalla lista con `waitForElement`, no a un temporizador.

Para verificar que un fichero aterrizó donde se esperaba, en Android y build *debuggable*:

```bash
adb shell run-as com.xone.android.framework sh -c 'ls -l app_miapp/objects.xml'
```

## 5. Bajar ficheros del dispositivo

### Android: `/file_download`

```
GET /file_download?appName=<nombreApp>&file=<rutaRelativa>
```

**La raíz NO es la misma que en la subida.** En `/file_upload` la ruta se resuelve contra el
**directorio de datos** (por eso se escribe `file=app_miapp/objects.xml`); en `/file_download` se
resuelve contra el **directorio de la app** que indica `appName`, así que la misma ruta se pide
como `file=objects.xml`. Aquí `appName` es obligatorio siempre.

Si falta un parámetro, la app no existe, el fichero no existe o no es un fichero regular →
**`404`**.

**Caso especial `.db`:** si el nombre termina en `.db` no se devuelve el fichero suelto, sino un
**ZIP** generado al vuelo con la base de datos, sus auxiliares `-shm`/`-wal`/`-journal` que
existan, y un fichero **`db.key`** con la **clave SQLCipher en claro** en el formato `x'<hex>'`
que espera un `PRAGMA key`.

> **Implicación de seguridad:** ese endpoint entrega la clave de cifrado en claro a quien pueda
> alcanzarlo. En disco el `.key` está protegido por el almacén seguro del dispositivo, pero en el
> ZIP viaja descifrado. El servidor solo existe en builds *debuggable*, pero conviene no exponer
> el puerto fuera de `localhost` / del túnel ADB.

### iOS: no hay

La ruta `/file_download` **está declarada pero es un esqueleto muerto**: parsea la query en dos
variables que no usa y devuelve `403` incondicionalmente. No hay forma de bajar ficheros por este
canal; para inspeccionar el contenedor del simulador, ve al sistema de ficheros directamente con
`xcrun simctl get_app_container`.

## 6. Reemplazar una base de datos (Android)

Sustituir un `.db` tiene dos trampas que no da ningún código de error:

**1. Ninguna de las vías HTTP cierra las conexiones abiertas a la base de datos.** Si se sube un
`.db` con la app viva, la subida responde `200 OK` y el fichero se escribe, pero el proceso sigue
usando el descriptor anterior: los cambios no aparecen, o se pierden cuando la app cierre y
vuelque lo suyo. **Parar la app antes de subir.**

**2. Los `-wal` / `-shm` antiguos siguen ahí** con transacciones de la base vieja. Hay que
borrarlos tras reemplazarla, o la app arrancará con estado inconsistente:

```bash
adb shell run-as com.xone.android.framework sh -c 'rm -f app_miapp/bd/gestion.db-wal app_miapp/bd/gestion.db-shm'
```

**Y va cifrada con SQLCipher.** La app no cifra una base plana al abrirla: espera encontrarla ya
cifrada con la clave que le corresponde (y si falta el `.key`, genera una nueva y espera la base
cifrada con *esa*). Subir una base sin cifrar termina en
`SQLiteDatabaseCorruptException: database disk image is malformed (code 11)`. Para editarla fuera
del dispositivo: bajarla con `/file_download` (que entrega el `db.key`), abrirla con esa clave,
editar, y volver a subirla cifrada con la misma clave.

En iOS no hay endpoints de fichero, así que este flujo no aplica; además, el `.xcframework` de
SQLCipher del repo solo trae slice `x86_64` para simulador, de modo que una app con base cifrada
falla en tiempo de ejecución al correr en simulador.

## 7. Códigos de respuesta HTTP (Android, endpoints de fichero)

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

En iOS, `POST /command` responde con el JSON del comando (incluido el de error), y con un cuerpo
que supere su tope responde también JSON en vez de cortar la conexión. **Un cuerpo enviado sin
`Content-Length` (`Transfer-Encoding: chunked`) funciona**: es el modo por defecto de varios
clientes HTTP, entre ellos el `http` de Node.

## El permiso de overlay, y por qué `launchApplication` fallaba

**Esto es preflight, no un extra.** Sin el permiso de dibujar sobre otras apps,
`launchApplication` **no puede arrancar nada mientras el framework esté en segundo plano**:
Android 10 y superiores bloquean el arranque de actividades desde ahí, y ese permiso es la
exención que reconocen.

```sh
adb shell appops set com.xone.android.framework SYSTEM_ALERT_WINDOW allow
```

Y el framework se queda en segundo plano **con solo apagarse la pantalla**, o en cuanto
`exitApplication` cierra la app — así que sin conceder el permiso cualquier reinicio es una
carrera contra el foco. Con él, el bucle de trabajo deja de depender de que la pantalla esté
encendida. Es idempotente: se puede volver a lanzar sin mirar.

Esto explica el síntoma que teníamos apuntado como «`result:true` significa *aceptado*, no
*arrancó*»: buena parte de esos arranques que no arrancaban eran este permiso, y el mensaje
del servidor lo dice — `Cannot launch app while the framework is in the background`.

```sh
adb shell appops get com.xone.android.framework SYSTEM_ALERT_WINDOW   # 'allow' = concedido
adb shell appops set com.xone.android.framework SYSTEM_ALERT_WINDOW default   # revertir
```

**Y el paquete cambia de flavor**: en el de Play Store es `com.xone.android.developer.framework`.

## Cuando el `curl` de comprobación no contesta

Tres causas, en este orden:

1. **El proceso de la app no está vivo.** El servidor solo existe en builds *debuggable* y
   arranca con el proceso. La pantalla del servidor lo levanta y además enseña IP y puerto
   reales:
   `adb shell am start -n com.xone.android.framework/com.xone.android.hotswap.activities.SetupActivity`
2. **El puerto no es 8443.** Si estaba ocupado —lo normal con DOS APK de framework
   instaladas— el servidor tomó el siguiente libre. El override guardado se lee con
   `adb shell run-as com.xone.android.framework cat shared_prefs/hotswap_preferences.xml`
   (claves `port_number` y `use_secure_connection`); si no dice nada, se sondea 8443–8446
   rehaciendo el forward a cada puerto remoto.
3. **El SSL está desactivado** (`use_secure_connection` a `false`): entonces el servidor habla
   `http://` y el cliente tiene que ir en claro.

Por LAN en vez de USB no hay forward: se apunta a la IP del dispositivo, la que enseña la barra
superior de esa pantalla.

## Dos cosas del despliegue que no dan ningún error cuando se hacen mal

- **El ZIP debe llamarse EXACTAMENTE `debug_app_update.zip`**: el nombre es lo que dispara la
  descompresión en el dispositivo. Y su contenido es lo que irá dentro de `app_<appname>`, **sin
  carpeta raíz que lo envuelva**.
- **El ZIP no limpia el destino**: añade y sobrescribe, no borra. Un fichero que quitaste del
  proyecto sigue en el dispositivo. Para un despliegue desde cero hay que vaciar `app_<appname>`
  antes — y eso se PIDE, no se hace.
- **`appName` se baja a minúsculas** para formar el directorio: `MiApp` → `app_miapp`.
- Y los `-wal`, `-shm` y `-journal` de una base de datos **ya no hay que borrarlos a mano**: al
  reemplazar una base, suelta o dentro del ZIP, se cierra lo que hubiera abierto y se van sus
  ficheros auxiliares. Antes, olvidarlo dejaba la base corrupta **sin dar ningún error**.

