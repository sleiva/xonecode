---
name: xone-granja
description: Probar una app XOne en la GRANJA de dispositivos XOne —teléfonos Android en otro PC— cuando el proyecto la usa en vez de los aparatos de este equipo. Usar al desplegar la app, recargar lo que cambió, mirar en qué pantalla está, pulsar o rellenar controles, leer el log, capturar la pantalla o reiniciar la app. Los scripts son los mismos que en un aparato local y van solos a la copia de la granja de esta sesión, sin adb.
---

# Probar una app XOne en la granja de dispositivos

Este proyecto prueba en la **granja de dispositivos XOne**: teléfonos Android conectados a otro PC, cada uno con
varias copias del framework. No hay ningún aparato de este equipo detrás, ni `adb` que llegue a ellos.

## Cómo funciona la copia (y por qué cada turno despliega)

- **No hay un teléfono reservado.** La primera vez que en este turno un script habla con el aparato, XOneCode pide a
  la granja una copia libre del framework y la deja para esta sesión. Todos los scripts del turno van a ESA copia.
- **Al acabar el turno la copia se LIBERA y se BORRA**: la app, su base de datos y lo que hayas tocado desaparecen.
  El turno siguiente recibe otra copia, vacía. Por eso **cada turno que pruebe empieza por `xone-desplegar-android`**.
- La copia es tuya mientras dure el turno; nadie más la toca. Si no hay copias libres, el script lo dice: espera o
  dilo en tu respuesta, no lo intentes en bucle.

## Qué usar para qué

Los scripts se llaman por su nombre, sin `--serie` ni `--puerto`: ya van a la copia de la sesión.

| quieres… | úsalo | en la granja |
|---|---|---|
| **poner la app en la copia** | `xone-desplegar-android` | sube el proyecto **con su base (`bd/`)** y la lanza; dice en qué colección quedó. Sin `bd/gestion.db` la app abre con «Base de datos no encontrada» |
| **subir lo que cambiaste** | `xone-recargar-android A.xne default.css …` | igual que en local, por el canal; no toca la base |
| **dónde estoy** | `xone-hotswap screen` | una línea: colección, diálogos, ventana |
| **ir a una ventana** | `xone-hotswap abrir NombreColeccion` | directo, sin repetir login y menús |
| **pulsar, rellenar, leer valores** | `xone-hotswap click/fill/getText/getFields/getRows …` | los mismos comandos del canal (`xone-hotswap --help`) |
| **volver atrás, ver los textos, esperar uno** | `xone-hotswap atras`, `textos`, `esperar <texto> timeout=5000` | por el canal: aquí no hay `adb shell input keyevent` ni `uiautomator dump` |
| **qué está fallando** | `xone-log-android` (`--app` para los `console.log`) | el log de ESTA copia y nada más; trae la excepción de XOne si la hubo |
| **si algo se VE mal** | `xone-captura-android --nombre x` | la pantalla de la copia en **JPEG**, con los diálogos encima |
| **reiniciar la app** | `xone-reiniciar-android --app MiApp` | recrea la pantalla vacía y vuelve a lanzar la app; lo desplegado sigue |

**El orden barato es el mismo que en local:** log → `screen` → y solo si lo que compruebas es VISUAL, la captura.
Una captura no diagnostica nada que el log no diga en texto, y cuesta mucho más.

## Lo que NO hay en la granja

- **Ni `adb`, ni emuladores, ni túneles**: `adb devices`, `adb shell`, `adb logcat` o `adb forward` hablan con ESTE
  equipo, no con la granja. No los uses para probar: lo que contesten no es la copia de la sesión.
- **El log no se puede vaciar** (`--limpiar` lo dice): para aislar lo de una acción, mira la hora de las líneas.
- **«Copiar solo lo modificado» no aplica a un despliegue**: la copia es nueva en cada turno y se sube entera.

## iOS

La granja es solo Android. Si la sesión tiene un simulador de iOS elegido, `xone-arrancar-ios` sigue siendo el de
este equipo.
