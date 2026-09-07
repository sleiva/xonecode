---
name: xone-android-hotswap
description: Probar una app XOne en un dispositivo o emulador ANDROID LOCAL a través del servidor hotswap que la propia app XOneStudio levanta en el dispositivo. Usar al desplegar una app en un móvil por adb, al reiniciarla para que aplique cambios, al capturar la pantalla o el árbol de controles, al pulsar o rellenar controles desde fuera, al leer el logcat o consultar la base de datos del dispositivo, y al diagnosticar por qué el dispositivo no responde en el puerto 8443.
---

# Probar en un Android local (hotswap)

El interlocutor es la app **XOneStudio ya instalada** en el dispositivo. No se compila ni se
instala un APK por iteración: se le suben los ficheros del proyecto, se reinicia y se mira.

El servidor hotswap **solo existe en builds *debuggable*** y vive DENTRO del proceso de la
app: si la app no está viva, el puerto no responde. Habla dos protocolos por el mismo puerto:
**WebSocket** para los comandos (`{"command": "..."}` → `{"result": ..., "status": ...}`) y
**HTTP(S)** para subir y bajar ficheros.

## Lo que hay que saber antes de tocar nada

- **HTTPS con certificado autofirmado.** Todas las URLs son `https://`; con `curl` hace falta
  `-k`. Solo escucha en `http://` si alguien desactivó la conexión segura a mano.
- **El puerto 8443 es el POR DEFECTO, no una garantía.** Si está ocupado —otra APK del
  framework instalada— el servidor coge el siguiente libre, y el real se ve en la pantalla del
  servidor hotswap (pestaña Información).
- **Se llega por `adb forward`**, y entonces la IP es `127.0.0.1` (el localhost del PC, que adb
  tuneliza al dispositivo). Con varios dispositivos, `adb -s <serial>`.
- **Subir NO aplica.** El proceso tiene cargado en memoria lo de antes: hay que reiniciar la app.
- **La base de datos va cifrada con SQLCipher.** Subir un `.db` en claro termina en
  `database disk image is malformed (code 11)`.

## El ciclo de prueba

```bash
# 1. ¿Hay dispositivo?
adb devices -l

# 2. Arrancar la app (y con ella el servidor) y ver IP:puerto en pantalla.
#    Flavor standalone; el de Play Store es com.xone.android.developer.framework.
adb shell am start -n com.xone.android.framework/com.xone.android.hotswap.activities.SetupActivity

# 3. Túnel. Reaplícalo después de cada reconexión del cable o reinicio del demonio.
adb forward tcp:8443 tcp:8443

# 4. Desplegar la app entera: un ZIP llamado EXACTAMENTE debug_app_update.zip.
curl -k -X POST --data-binary @debug_app_update.zip \
  "https://127.0.0.1:8443/file_upload?file=debug_app_update.zip&appName=MiApp"

# 5. Reiniciar para que lo lea, y ESPERAR: carga del proyecto y motor de scripting.
adb shell am force-stop com.xone.android.framework
adb shell am start -n com.xone.android.framework/.mainEntry
```

A partir de ahí, los comandos WebSocket: `launchApplication`, `waitForElement`, `getAllElements`,
`getScreenshot`, `click`/`fill`/`getText`, `getLog`. Ver la referencia.

## Cómo se prueba, y qué cuenta como evidencia

1. **Reproduce el estado**: lanza la app (`launchApplication`) y espera al control que marca la
   pantalla lista (`waitForElement`), nunca a un temporizador fijo.
2. **Mira el árbol antes de tocar** (`getAllElements`). El formato `xone` da los controles con su
   nombre XOne, que es por el que se pulsa; el formato `uiautomator` da el volcado clásico, útil
   para comparar con una herramienta externa.
3. **Actúa por NOMBRE de control** (`click`, `tap`, `fill`, `scroll`), no por coordenadas: las
   coordenadas cambian con el tamaño de pantalla y no dicen qué se intentaba pulsar.
4. **Comprueba con un dato, no con una impresión**: `getText`, `isVisible`, `isEnabled`, `runSql`
   contra la base de datos. Una captura sirve para ENSEÑAR el fallo, no para afirmar que algo
   funciona — nadie puede releerla.
5. **Si algo falla, trae el log** (`getLog`, o `setLogEnabled` para el streaming) y la línea
   concreta. «No funciona» no es un hallazgo.

## Reglas que evitan diagnósticos falsos

- **No inventes controles.** Si `getAllElements` no lo lista, no existe en esa pantalla: dilo en
  vez de probar nombres a ver si suena alguno.
- **Un `result: false` es el resultado**, no un error del que recuperarse en silencio. Su `status`
  dice exactamente qué pasó («Element 'X' not found or not enabled»).
- **Distingue «la app no está viva» de «la prueba falla».** Conexión rechazada en el puerto es lo
  primero, y se arregla con `am start` + `adb forward`, no cambiando el código de la app.
- **Después de subir, reinicia.** Un resultado medido sin reiniciar está midiendo la versión
  anterior, y es el error más caro de todos porque no da ningún síntoma.
- **No dejes el dispositivo peor de como estaba**: `clearMockData` tras usar datos simulados, y
  `disableDeviceLogging` / `setLogDisabled` tras acabar.

## Referencias

| Qué | Dónde |
|---|---|
| Los comandos WebSocket, uno a uno: entrada, salida y errores | [references/comandos.md](references/comandos.md) |
| Subir y bajar ficheros por HTTP, reinicio, y las trampas del `.db` | [references/ficheros.md](references/ficheros.md) |
