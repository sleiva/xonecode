---
name: xone-hotswap
description: Probar una app XOne en un dispositivo o emulador LOCAL —Android o iOS— a través del servidor hotswap que la propia app host levanta en el dispositivo. Usar al desplegar una app en un móvil o simulador, al reiniciarla para que aplique cambios, al capturar la pantalla o el árbol de controles, al pulsar o rellenar controles desde fuera, al leer el log o consultar la base de datos del dispositivo, y al diagnosticar por qué el dispositivo no responde en el puerto 8443. Cubre las dos plataformas y dice, comando por comando, cuál de las dos lo tiene.
---

# Probar una app XOne en un dispositivo local (hotswap)

El interlocutor es la **app host ya instalada** en el dispositivo. No se compila ni se instala
un paquete por iteración: se le suben los ficheros del proyecto, se reinicia y se mira.

| | Android | iOS |
|---|---|---|
| App host | **XoneStudio** (`com.xone.android.framework`, o `com.xone.android.developer.framework` en el flavor de Play Store) | **XOneStudioSwift** (`es.xone.studioapp.swift`) |
| Solo existe en | builds *debuggable* | el runtime en **modo desarrollo** (`XoneAppDeveloment`); en una app de producción no existe |

El servidor vive **dentro del proceso de la app**: si la app no está viva, el puerto no
responde. Habla dos protocolos por el mismo puerto: **WebSocket** para los comandos
(`{"command": "..."}` → `{"result": ..., "status": ...}`) y **HTTP(S)** para lo demás.

## Lo que hay que saber antes de tocar nada

- **HTTPS con certificado autofirmado** en las dos plataformas. Todas las URLs son `https://`;
  con `curl` hace falta `-k`. Solo escucha en `http://` si alguien desactivó la conexión segura.
- **El puerto 8443 es el POR DEFECTO, no una garantía.** En Android, si está ocupado —otra APK
  del framework instalada— el servidor coge el siguiente libre, y el real se ve en la pantalla
  del servidor hotswap (pestaña Información).
- **Subir NO aplica.** El proceso tiene cargado en memoria lo de antes: hay que reiniciar la app.
- **La base de datos va cifrada con SQLCipher.** Subir un `.db` en claro termina en
  `database disk image is malformed (code 11)`.
- **En iOS, `POST /command` sirve solo los comandos de automatización** — los de los bloques
  **Ver la pantalla** y **Tocar**. Los comandos legados (`launchApplication`, `setAttribute`,
  `listAppFiles`…) son **solo WebSocket**: sus manejadores responden escribiendo en el socket, que
  en una petición HTTP no existe, así que por HTTP contestan `Unknown command '<x>'` aunque el
  comando exista. Cuál es cuál, comando a comando: la columna **Canal (iOS)** de la
  [matriz](references/comandos.md#matriz-de-disponibilidad).

## Los scripts que trae esta skill, y cómo se llaman

Esta carpeta trae tres programas listos. **Son la forma de usar el canal desde una shell**, y
existen por una razón concreta: los comandos viajan por **WebSocket** y `curl` no habla
WebSocket, así que sin ellos no hay manera de mandar un `getAllElements` desde la línea de
órdenes. Se llaman por la variable de entorno de esta skill, nunca con una ruta escrita a mano:

```bash
# Un comando cualquiera del catálogo (varios, en orden, si le pasas varios):
node "$XONECODE_SKILL_XONE_HOTSWAP/scripts/hotswap.mjs" '{"command":"getAllElements","format":"xone"}'

# Android: poner ESTE proyecto en el aparato y dejar la app arrancada, la cadena entera.
node "$XONECODE_SKILL_XONE_HOTSWAP/scripts/android-desplegar.mjs"

# iOS: levantar el host y dejar el canal listo (desplegar en iOS NO está medido).
node "$XONECODE_SKILL_XONE_HOTSWAP/scripts/ios-arrancar.mjs"
```

Tres cosas de `hotswap.mjs` que conviene saber antes de leer su salida:

- **Una captura no se imprime**: se guarda en `$XONECODE_ARTEFACTOS` y lo que sale es su
  nombre y su tamaño. Un `getScreenshot` son ~57.000 caracteres de base64, y volcarlos en la
  salida de un comando es meterlos en el contexto sin que nadie pueda mirarlos. Para
  ENSEÑARLA, di su nombre: la interfaz la enseña desde ahí.
- **La respuesta viene en `status`** —no en un campo `image`— y una captura de Android es
  **JPEG**, no PNG.
- Si la llamada muere con «no se pudo hablar con el aparato», casi siempre falta el túnel
  (`adb forward tcp:8443 tcp:8443`) o la app host no está viva.

**Un comando que no termina cuelga tu turno.** Arrancar un emulador no vuelve nunca: mándalo al
fondo y espera a una CONDICIÓN, no a un número de segundos.

```bash
emulator -avd <nombre> >/dev/null 2>&1 &
adb wait-for-device
adb shell 'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 2; done'
```

Y ojo con el PATH: tus comandos corren con `/bin/sh`, sin el `~/.zshrc` de nadie. En un Mac con
Homebrew, `emulator` suele estar en `$(brew --prefix)/share/android-commandlinetools/emulator/`
aunque `adb` sí esté en el PATH.

## Cómo llegar, según la plataforma

**Android** — por `adb forward`, y entonces la IP es `127.0.0.1` (el localhost del PC, que adb
tuneliza al dispositivo). Con varios dispositivos, `adb -s <serial>`:

```bash
adb devices -l
adb shell am start -n com.xone.android.framework/com.xone.android.hotswap.activities.SetupActivity
adb forward tcp:8443 tcp:8443          # reaplicar tras cada reconexión del cable
```

**iOS** — **no hay `adb` ni túnel**. El simulador comparte la pila de red del Mac, así que el
servidor es alcanzable directamente; en dispositivo físico se llega por la IP de la LAN que
muestra la propia app:

```bash
xcrun simctl list devices booted
xcrun simctl launch <UDID> es.xone.studioapp.swift    # arrancar el host levanta el servidor
curl -sk -X POST https://localhost:8443/command -d '{"command":"getAllElements"}'
```

Detalle de despliegue, relanzado y endpoints de fichero: [conexión y despliegue](references/conexion-y-despliegue.md).

## Qué hay en cada plataforma, de un vistazo

| Bloque | Android | iOS |
|---|---|---|
| Ver la pantalla (`getAllElements`, `getCurrentScreen`, `getScreenshot`, `getText`, `getUiAttribute`, `getRows`, `isVisible`, `isEnabled`, `waitForElement`) | sí | **sí**, con desviaciones (abajo) |
| Tocar (`click`, `tap`, `doubleTap`, `longPress`, `openSelector`, `fill`, `clear`, `scroll`, `pressKey`) | sí | **sí**, con desviaciones (abajo) |
| Ciclo de app (`launchApplication`, `exitApplication`, `directdownload`) | sí | `launchApplication` y `directdownload` sí; `exitApplication` no |
| Atributos y colecciones (`setAttribute`, `deleteAttribute`, `loadCollection`) | sí | sí |
| CSS, `replaceProperty`, `refresh`, `relayout`, `loadIncludeFile` | sí | **no** |
| Ficheros (`/file_upload`, `/file_download`, `uploadFile`, `getFileChecksum`) | sí | **no** (`listappfiles` sí) |
| Scripts y SQL (`runScript`, `runSql`, `getDatabaseTableNames`, `queryDatabaseTable`) | sí | **no** |
| Logs (`getLog`, `*DeviceLogging`, `setLog*`) | sí | **no** |
| Mock de hardware (`setMockData`, `clearMockData`) | sí | **no** |
| Edición en vivo (`enable/disableLiveEditionMode`) | sí | **no** |
| Depurador JS (`debug`) | sí | **no** (JavaScriptCore no tiene API pública de depuración) |

**Lo que en 5.0.2.2dev NO existe, medido el 16-sep-2026** (flavor standalone, Android, **con una app
ya cargada y viva**): `getCurrentScreen` y `status`/`state` contestan `Unknown command`, aunque esta
tabla los dé por disponibles. Para ver la pantalla, lo que responde es `getAllElements` —el árbol de
controles— y `getScreenshot` —el PNG en base64—. Y **el nombre de un comando es EXACTO**: no hay
alias insensible a mayúsculas. `launchApplication`, `setAttribute` y `listAppFiles` existen; sus
variantes en minúscula contestan `Unknown command`, que es como se descubrió.

Comando por comando, con su contrato y sus desviaciones: [comandos](references/comandos.md).

Los doce comandos que apuntan por nombre (`getText`, `isVisible`, `isEnabled`, `waitForElement`,
`click`, `tap`, `doubleTap`, `longPress`, `openSelector`, `fill`, `clear`, `scroll`) aceptan
además **`row` / `content` / `where`** para apuntar a una **fila**: por índice, por content, o por
**lo que contiene** (`{"ID":"2938733"}`). Solo existen las filas **pintadas**; el índice es el de
la colección y **no se renumera con el scroll**; y `waitForElement` con `row` espera a que la
fila **esté pintada**, no a que la colección tenga datos. Para leer las filas que NO están a la
vista, `getRows` — que lee el modelo, no las vistas.

## Lo que iOS no puede hacer IGUAL, y por qué

No son carencias de implementación: son límites y consecuencias de la plataforma, y el canal las
responde con un motivo en vez de fingir. **Declarar lo que iOS no puede hacer igual vale más que
fingir paridad**: con la diferencia delante se puede trabajar; con una promesa falsa, no.

- **No hay inyección de toques ni de teclas.** `click` invoca el manejador del control (como el
  `performClick()` de Android), así que **`click` y `tap` colapsan** en el mismo efecto, y
  `doubleTap`/`longPress` **siempre se niegan**: el runtime iOS no tiene eventos XONE de doble
  toque ni de pulsación larga en props/frames. `pressKey` solo traduce `4`/`back` y `66`/`enter`
  (con `key` simbólico: `back`, `enter` y `done`).
  Por eso `has no click handler` va **sin** la coletilla `use 'tap' to send a real touch` de
  Android: mandaría a repetir la llamada que acaba de fallar.
- **No hay codificación WebP.** `getScreenshot` devuelve JPEG al 50% (o PNG si se pide) y lo
  declara en `imageFormat`.
- **La captura no lo captura todo**: quedan fuera la cámara en vivo, las capas Metal/GL, las
  teselas de mapa y la barra de estado del sistema (otro proceso).
- **Los memos multilínea y los campos de fecha/hora no los escribe ESTE CANAL**, y lo dicen así:
  `Element 'X' is editable, but this channel cannot write a multiline|date/time field`. El usuario
  sí puede editarlos — no es un control equivocado, es un límite del canal.
- **Los dos volcados NO son compatibles atributo a atributo.** iOS emite **8** atributos y Android
  **19**, con solo **5 comunes** (`index`, `class`, `text`, `enabled`, `bounds`). iOS no tiene
  `resource-id` —con el que Android nombra las piezas de un diálogo— ni `content-desc` ni los
  booleanos (`checkable`, `clickable`, `scrollable`…), y tiene tres propios (`accessibility-id`,
  `label`, `visible`). En iOS el canónico es **`uikit`**; `uiautomator` se acepta como **alias**
  para que una llamada multiplataforma no falle, pero **devuelve datos con forma de iOS**.
- **La búsqueda mira primero lo que está ENCIMA** (diálogos, toasts) y la pantalla al final.
  Alcanzar un control tapado **nombrándolo** sigue permitido; lo que cambió es el orden. Los
  niveles **anteriores** de navegación **no se buscan**: un `not found` sobre un control de la
  pantalla que dejaste atrás significa que todavía no has navegado.

Las **once divergencias con Android**, con su porqué:
[comandos → Divergencias](references/comandos.md#divergencias-con-android).

## Dos avisos sobre el host iOS que te vas a encontrar

Ninguno es del hotswap; los dos te van a costar una sesión si no los sabes.

- **`MyAllXOne` crashea al arrancar** en el host (GoogleMaps). Para probar **filas**, el fixture
  usable es **`FontIconsApp`**.
- **El host se cae al abrir una lista de menú**: le faltan los `xone_img_*.png`, y
  `CollectionViewController`/`SortView` meten `UIImage` nil en arrays. Es un defecto **ajeno** al
  hotswap. Si el puerto deja de responder justo después de abrir un menú, es esto.

## Cómo se prueba, y qué cuenta como evidencia

1. **Reproduce el estado**: lanza la app y espera al control que marca la pantalla lista
   (`waitForElement`), nunca a un temporizador fijo.
2. **Pregunta dónde estás** (`getCurrentScreen`, **iOS**) tras cada navegación: dice la pantalla,
   su colección, qué diálogos hay encima y cuál se lleva los toques. Es una respuesta corta, y
   evita interpretar un volcado para averiguar lo mismo.
3. **Mira el árbol antes de tocar** (`getAllElements`). El formato `xone` da los controles con su
   nombre XOne, que es por el que se pulsa; el otro formato da el volcado de la jerarquía de
   vistas, útil para distinguir "ese control no existe" de "existe pero el motor no lo indexa".
   Para el contenido de una **lista**, `getRows`: el volcado solo trae las filas pintadas.
4. **Actúa por NOMBRE de control** (`click`, `tap`, `fill`, `scroll`), no por coordenadas: las
   coordenadas cambian con el tamaño de pantalla y no dicen qué se intentaba pulsar.
5. **Comprueba con un dato, no con una impresión**: `getText`, `isVisible`, `isEnabled`, y el
   propio `getAllElements` antes y después. Una captura sirve para **enseñar** el fallo, no para
   afirmar que algo funciona — nadie puede releerla.
6. **Si algo falla, trae el log** (Android) o la respuesta literal del comando (las dos
   plataformas) y la línea concreta. «No funciona» no es un hallazgo.

## Reglas que evitan diagnósticos falsos

- **No inventes controles.** Si `getAllElements` no lo lista, no existe en esa pantalla: dilo en
  vez de probar nombres a ver si suena alguno.
- **Un `result: false` es el resultado**, no un error del que recuperarse en silencio. Su `status`
  dice exactamente qué pasó. En iOS, un control **ausente** ya no se confunde con uno
  **intocable**, y cada mensaje manda a un sitio distinto: `not found` (corrige el nombre) ·
  `is not enabled` (rellena antes la pantalla) · `has editing disabled` (desbloquéalo en la app).
  El catálogo entero, con qué arregla cada uno:
  [comandos → El catálogo de errores](references/comandos.md#el-catálogo-de-errores-desdoblado-ios).
- **Para saber si un campo se puede escribir, mira `editDisabled`, no `enabled`.** `enabled`
  devuelve lo mismo en un campo bloqueado y en uno que no se escribe nunca; `editDisabled:true`
  (que solo se emite cuando es cierto) es el único que los separa. Y su **ausencia no promete**
  que el `fill` funcione: un memo o un campo de fecha salen sin él y este canal tampoco los
  escribe.
- **Distingue «la app no está viva» de «la prueba falla».** Conexión rechazada en el puerto es lo
  primero. En iOS hay además una distinción propia: `"App is not running"` significa que no hay
  ninguna app XONE lanzada, mientras que `"Screen '<clase>' is not readable by the 'xone' format"`
  significa que sí la hay, pero su pantalla es de un camino de render que ese formato no lee.
- **Después de subir, reinicia.** Un resultado medido sin reiniciar está midiendo la versión
  anterior, y es el error más caro de todos porque no da ningún síntoma.
- **No dejes el dispositivo peor de como estaba**: `clearMockData` tras usar datos simulados
  (Android), y `disableDeviceLogging` / `setLogDisabled` tras acabar.

## Referencias

| Qué | Dónde |
|---|---|
| Los comandos, uno a uno: entrada, salida, errores y qué plataforma lo tiene | [references/comandos.md](references/comandos.md) |
| Llegar al dispositivo, desplegar una app, relanzarla, y los endpoints de fichero | [references/conexion-y-despliegue.md](references/conexion-y-despliegue.md) |
