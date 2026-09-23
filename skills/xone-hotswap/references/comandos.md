# Comandos del servidor hotswap, por plataforma

Los mensajes llegan como un JSON con el campo `command`; las respuestas son subclases de
`ResultMessage`. El contrato de Android es la referencia **literal** de lo que implementa
`handleClientResponse()` en la app XoneStudio, copiada de la documentación del framework. iOS
implementa **el mismo JSON y los mismos mensajes de error literales** en los comandos que tiene,
para que un cliente escrito contra Android siga funcionando; donde no puede, la desviación está
anotada y marcada **(iOS)**.

**Declarar una diferencia vale más que fingir paridad.** Todo lo marcado **(iOS)** es una
desviación real y medida: si la lees antes de actuar, puedes trabajar con ella; si te crees una
promesa de paridad que no se cumple, diagnosticarás mal. Las que más caro salen —las que un
`result:true` no basta para descubrir— están reunidas al final, en
[Divergencias con Android](#divergencias-con-android).

Cómo llegar al dispositivo y cómo desplegar: [conexion-y-despliegue.md](conexion-y-despliegue.md).

## Lo que llegó con el framework 5.0.5.5dev (protocolo 3)

Tres comandos y un modo de traza que la referencia anterior no tenía. Salen del pack de
`dispositivo-xone`, que es la documentación del equipo del framework.

| comando | campos | qué hace |
|---|---|---|
| `getFields` | `names` (**sí**: array o lista separada por comas) | Varios campos en UN viaje, cada uno leído como lo leería `getText`. Devuelve `fields`, con `value` **o** `error` por campo. No acepta `name`. |
| `openRecord` | `collection` (sí), `where` | Abre la ficha de un registro **directamente**, sin menú, lista ni scroll. |
| `setGroup` | `group` (sí) | Lleva la pantalla a ese grupo. No acepta `name` ni fila. |
| `setTrace` | `enabled` | Enciende la traza de ejecución línea a línea. Apagada por omisión. |

Cuatro cosas de estos que no se deducen:

- **`getFields` es la forma barata de leer varios valores.** Un campo que falle **no tumba a los
  demás**: viene con su `error` mientras los otros traen su `value`, y eso es lo que distingue un
  campo vacío de uno que no se pudo leer.
- **Cada `openRecord` APILA una ficha más, no sustituye a la anterior.** Medido por el equipo del
  framework: con dos seguidos, el primer `pressKey keyCode=4` devuelve a la ficha anterior y no a
  la pantalla de partida. Al recorrer varios registros hay que cerrar cada ficha antes de abrir la
  siguiente.
- **A un grupo se llega con `setGroup`, NUNCA con `scroll`.** El contenedor de grupos no arrastra
  cuando el gesto nace encima de un control —tampoco con el dedo de una persona—, y un comando solo
  sabe apuntar a controles: por ahí no se llega nunca, por bien que se entregue el gesto. El nombre
  es el del volcado (`type: "group"`), no el rótulo de su pestaña, y el cambio es ANIMADO, así que
  se confirma con `elements` o `waitForElement` y no por la respuesta.
- `setGroup` y `pressKey` son los dos únicos que **no aceptan** los campos de selección de control
  (`name`, `row`, `content`, `where`): no apuntan a ningún control.

Y `getFields` se suma a la lista de los que devuelven su objeto **serializado dentro de `status`**
—con `getAllElements`, `getCurrentScreen` y `getRows`—, así que hay que volver a parsear esa cadena.


## Tipos de respuesta

| Tipo | JSON resultante | iOS |
|---|---|---|
| `ResultMessage()` | `{ result: true, status: "" }` | sí |
| `ResultMessage(string)` | `{ result: true, status: "<string>" }` | sí |
| `ResultMessage(false, string)` | `{ result: false, status: "<string>" }` | sí |
| `ResultMessage(exception)` | `{ result: false, exceptionClass: "...", exceptionMessage: "..." }` | sí, pero ver la nota al final |
| `SqlMessage` | `{ result: true/false, sql: "...", data: [...filas...] }` | no |
| `ListDirectoryMessage` | `{ result: true, status: "listAppFiles", paths: [...] }` | sí |
| `GetFileChecksumMessage` | `{ result: { "<archivo>": "<checksum>", ... } }` — *`result` es un objeto, no boolean* | no |
| `FullLogMessage` | `{ result: true, basicInfo: {...}, logcat: "...", exception: "...", stackTrace: "..." }` | no |
| `DebugMessage` | JSON específico del depurador JS | no |

## Matriz de disponibilidad

La columna **Canal (iOS)** dice por dónde se le puede hablar a cada comando, y **no es un detalle
de transporte**: los comandos legados responden escribiendo en el socket, que en una petición HTTP
no existe, así que un `POST /command` con uno de ellos contesta `Unknown command '<x>'` aunque la
columna iOS diga "sí". Solo el bloque de automatización (**Ver la pantalla** + **Tocar**) se sirve
por los dos canales.

| Comando | Android | iOS | Canal (iOS) |
|---|---|---|---|
| `launchApplication` | sí | sí | **solo WS** |
| `exitApplication` | sí | — | — |
| `directdownload` | sí | sí | **solo WS** |
| `loadCollection` | sí | sí | **solo WS** |
| `loadIncludeFile` | sí | — | — |
| `setAttribute` | sí | sí | **solo WS** |
| `deleteAttribute` | sí | sí | **solo WS** |
| `replaceProperty` | sí | — | — |
| `setCssAttribute` / `deleteCssAttribute` | sí | — | — |
| `refresh` / `relayout` | sí | — | — |
| `status` / `state` | sí | sí | **solo WS** |
| `uploadFile` | sí | — | — |
| `listAppFiles` | sí | sí | **solo WS** |
| `getFileChecksum` | sí | — | — |
| `runScript` | sí | — | — |
| `runSql` / `getDatabaseTableNames` / `queryDatabaseTable` | sí | — | — |
| `getLog` / `enableDeviceLogging` / `disableDeviceLogging` / `setLogEnabled` / `setLogDisabled` | sí | — | — |
| `enableLiveEditionMode` / `disableLiveEditionMode` | sí | — | — |
| `setMockData` / `clearMockData` | sí | — | — |
| `debug` (+13 subcomandos) | sí | — | — |
| `getAllElements` | sí | sí (tres nombres de formato, dos formatos) | WS + HTTP |
| `getCurrentScreen` | sí | sí (`activity` es un nombre de clase, no una Activity) | WS + HTTP |
| `getScreenshot` | sí | sí (JPEG/PNG) | WS + HTTP |
| `getText` | sí | sí (+ `source`) | WS + HTTP |
| `getUiAttribute` | sí | sí (ver la desviación) | WS + HTTP |
| `getRows` | sí | sí (ver las desviaciones) | WS + HTTP |
| `isVisible` / `isEnabled` | sí | sí | WS + HTTP |
| `waitForElement` | sí | sí | WS + HTTP |
| `click` / `tap` | sí | sí (colapsan) | WS + HTTP |
| `doubleTap` / `longPress` | sí | se niegan siempre | WS + HTTP |
| `openSelector` | sí | sí | WS + HTTP |
| `fill` / `clear` | sí | sí (no multilínea ni fecha/hora) | WS + HTTP |
| `scroll` | sí | sí (necesita ancestro scrollable **en el eje pedido**) | WS + HTTP |
| `pressKey` | sí | solo `4`/`back` y `66`/`enter` | WS + HTTP |

**Doce** de ellos aceptan además `row` / `content` / `where` para apuntar a una fila:
[Apuntar a una fila](#apuntar-a-una-fila).

---

## Un nombre de control puede existir en dos pantallas

Los nombres son **por colección**, no globales. En AliviaApp, `MAP_LOGIN_BTN` es el botón "Inicia
Sesión" en `EntradaApp` **y** el botón de enviar en `Login`: el mismo nombre, dos controles con
distinta jerarquía, distinto estado y distinto comportamiento ante `scroll` o `isEnabled`. Antes
de creerte una respuesta, confirma en qué pantalla estás (el `collectionName` que devuelve
`getAllElements` lo dice). Es una fuente de diagnósticos falsos que parece imposible hasta que
te pasa.

## Apuntar a una fila

Los **doce** comandos de interacción y lectura por nombre (`getText`, `isVisible`, `isEnabled`,
`waitForElement`, `click`, `tap`, `doubleTap`, `longPress`, `openSelector`, `fill`, `clear`,
`scroll`) aceptan tres campos más, todos opcionales, para decir **qué fila** de una lista:

| Campo | Qué hace |
|---|---|
| `row` | Índice de fila **en la colección** (el mismo que publica `getRows` y el volcado) |
| `content` | Nombre del prop de tipo content, para desempatar cuando hay dos listas |
| `where` | Objeto `{campo: valor}`: la fila **por lo que contiene**, p.ej. `{"ID":"2938733"}` |

Sin ninguno de los tres, el nombre resuelve al control de pantalla de siempre. Se combinan:

- **solo `content`** → la fila `0` de esa lista (**fija**, no "la primera pintada": tras
  desplazar, el mismo comando devolvería otra fila sin que nada lo dijera);
- **solo `where`** → la primera fila **pintada** que lo cumple;
- **`row` + `where`** → se exigen los DOS, o sea que `row` pasa de atajo a **comprobación**.

```
$ curl … -d '{"command":"getText","name":"MAP_NAME","row":12,"content":"MAP_CONTENT"}'
$ curl … -d '{"command":"click","name":"MAP_BORRAR","where":{"ID":"2938733"}}'
```

### Las tres reglas que hay que saber antes de usarlo

1. **Solo existen las filas PINTADAS.** El apuntado por fila baja a la celda, y una celda que el
   reciclado no tiene montada no existe: `Element '<name> row N' not found`. Para leer las que no
   están a la vista está `getRows`, que lee el modelo y no las vistas — o desplaza la lista con
   `scroll` y vuelve a pedirla.
2. **El índice NO se renumera con el scroll.** Es el de la colección, así que sigue valiendo
   después de desplazar. Medido en FontIconsApp/LottieAnimation (13 filas): antes del scroll el
   volcado publica `[0..7]`; después, `[6..12]`, y `row:12` —que antes no se podía pedir— pasa a
   contestar su valor. La ventana se mueve; la numeración no.
3. **`waitForElement` con `row` espera a que la FILA ESTÉ PINTADA**, no a que la colección tenga
   datos. Es lo correcto —lo que estás esperando es poder tocarla— pero significa que una fila
   que la lista nunca llega a montar agota el `timeout`, por muchos datos que haya cargado. La
   única excepción, que no espera nunca, es un `where` que nombra un campo inexistente: eso no va
   a aparecer esperando, así que se contesta el error del campo en vez de agotar el tope.

### Qué contesta cuando no resuelve

| Respuesta | Qué pasó | Qué arregla |
|---|---|---|
| `Element '<name> row N' not found` | La fila no está pintada (o el índice se sale) | Desplazar la lista, o usar `getRows` |
| `Element '<name>' not found` | La fila SÍ está pintada y el que no está es el nombre; o no hay content con ese nombre; o se pidió por `where` sin `row` y ninguna casa | Corregir el nombre |
| `Element '<name>' is ambiguous, pass 'content' to choose between 'A', 'B'` | El nombre resuelve en DOS contents | Pasar `content` |
| `Field 'X' does not exist in collection 'Y'` | El `where` preguntó por un campo que la colección no tiene | Corregir el `where`, no la fila |

**(iOS)** El mensaje de ambigüedad lleva la lista **ordenada** de contents: los nombres salen de
un diccionario de Obj-C sin orden fijado, y sin ordenarlos el MISMO comando contestaba dos frases
distintas en dos llamadas seguidas. Si ninguno de los dos contents tiene nombre utilizable, se
dice el hecho **sin** la lista (`…resolves in more than one content, pass 'content' to choose
one`): mandar a elegir entre nada es peor que no decirlo.

## Ver la pantalla

### `getAllElements` — las dos plataformas

Devuelve la información de los controles visibles. `format` elige el formato: `"xone"` (default)
o, en Android, `"uiautomator"`; en iOS, `"uikit"` — y **`"uiautomator"` se acepta como alias de
`"uikit"`** para que un cliente de Android no rompa. **El alias vale para la llamada, no para el
contenido**: lee la [advertencia](#los-dos-volcados-no-son-compatibles-atributo-a-atributo) antes
de escribir nada que lea esos atributos.

**Salida:** `ResultMessage(string)`, con el payload dentro de `status`.
**Errores:** formato desconocido → Android dice
`"Unknown format '...', expected 'xone' or 'uiautomator'"`; **(iOS)** dice
`"Unknown format '<x>', expected 'xone', 'uikit' or 'uiautomator'"`, nombrando las tres formas
que acepta. `"App is not running"` **(iOS)** solo lo contesta el formato `xone`: el `uikit` vuelca
las ventanas de UIKit y no necesita que haya ninguna app XONE lanzada. Y si hay app pero su
pantalla es de otro camino de render, `"Screen '<clase>' is not readable by the 'xone' format"`.

`format: "xone"` — array JSON con un descriptor por control: `name`, `type`, `collectionName`,
`visible`, `enabled`, `bounds` y `text` si aplica. **(iOS)** además `propType`, `window`,
`created`, `floating` (en los frames) y, condicionales, `editDisabled` y `row`+`content` — ver
[los campos nuevos](#los-campos-nuevos-del-descriptor-xone-ios).

- **(iOS)** `bounds` va en **puntos** y en coordenadas de ventana, `"[x1,y1][x2,y2]"`; Android los
  da en píxeles de pantalla.
- **(iOS)** el array trae `propType`, y `text` **solo aparece si el campo tiene valor**: un prop
  con campo vacío no lleva la clave. Eso es útil — los elementos sin `text` son exactamente los
  de campo vacío.
- **(iOS)** el **orden no es determinista** entre llamadas (viene de un diccionario). No compares
  dos capturas por posición.
- **(iOS)** un prop declarado `visible="0"` en el XML **no sale**, porque el motor no llega a
  crear el control; preguntarle por él da `not found`, no `visible:false`.
- **(iOS)** con un **diálogo modal delante**, el volcado `xone` contesta `[]`: lo de debajo está
  tapado y publicarlo serviría para actuar sobre algo que una persona no podría tocar. Un `[]`
  no significa "pantalla vacía"; pregunta `getCurrentScreen` para ver qué hay encima.

#### Los campos NUEVOS del descriptor `xone` **(iOS)**

| Campo | Qué dice | Cuándo sale |
|---|---|---|
| `window` | De qué ventana publicada sale el control | siempre |
| `created` | Si el control ha pasado por su construcción | siempre, y **siempre `true`** (ver divergencia 3) |
| `editDisabled` | El control **se escribe**, pero tiene la edición bloqueada | **solo cuando es `true`** |
| `row` | El índice de fila, el mismo que se pasa en `row` | solo en los controles de una fila |
| `content` | El nombre del prop de tipo content de esa fila | solo en los controles de una fila |

**`editDisabled` es el ÚNICO campo que distingue un campo bloqueado de uno escribible.**
`enabled` devuelve lo mismo en los dos que no se pueden escribir —un botón con `disableedit` y un
campo de texto con `locked` salen los dos con `enabled:false`—, y solo el segundo lleva
`editDisabled:true`. Medido en AliviaApp/Login:

| Control | Volcado | Qué contesta `fill` |
|---|---|---|
| `MAP_LOGIN_BTN` (`type="B"`, `disableedit`) | `enabled:false`, **sin** `editDisabled` | `Element 'MAP_LOGIN_BTN' is not editable` |
| `MAP_EMAIL` (`type="T"`, libre) | `enabled:true`, **sin** `editDisabled` | `result:true` |
| `MAP_BOTTOM_TEXT3` (`type="T"`, `locked`) | `enabled:false`, **con** `editDisabled:true` | `Element 'MAP_BOTTOM_TEXT3' has editing disabled` |

Léelo **en una sola dirección**: si `editDisabled` está, el `fill` se va a negar por eso. Su
**ausencia no promete** que el `fill` funcione — un memo o un campo de fecha salen sin él y aun
así los rechaza este canal (ver `.unsupportedField` en la divergencia 7).

Los controles de FILA **no lo traen nunca** (divergencia 4), y `created` no vale `false` jamás
(divergencia 3).

`format: "uiautomator"` (Android) — XML equivalente al de `uiautomator dump`, con los 17
atributos clásicos más `hint` y `displayed`, construido pidiendo a cada vista su
`AccessibilityNodeInfo`. Comprobado contra `adb shell uiautomator dump`: mismo número de nodos,
misma profundidad, mismos `resource-id`.

`format: "uikit"` (iOS) — XML con la jerarquía de vistas de las ventanas de la app: `index`,
`class`, `accessibility-id`, `label`, `text`, `enabled`, `visible`, `bounds`, y `xone-name` /
`xone-type` cuando la vista es un control XOne. **No se inventan** los atributos que iOS no
tiene (`checkable`, `password`, `long-clickable`…). Tiene topes (profundidad 80, 4000 nodos) y
si alguno salta lo dice con un `<truncated reason="..."/>`.

**Los dos formatos NO cubren la misma población, y eso es el punto.** Medido en `EntradaApp` de
AliviaApp (un carrusel de tres pestañas): `xone` devuelve 22 controles —todo lo que el motor
indexa, incluidas las páginas que no están montadas— y `uikit` trae los 8 que UIKit tiene
montados. La correspondencia es exacta: **los visibles del `xone` están todos en el `uikit`, y
ninguno de los no visibles**. La invariante que se comprueba es "todo control **visible** del
`xone` está en el `uikit`". Un control que sale en `xone` con `visible:false` y no sale en el
volcado no es una incoherencia: es la respuesta a "existe pero no está en pantalla".

#### Los dos volcados NO son compatibles atributo a atributo

**El `uikit` de iOS y el `uiautomator` de Android no llevan los mismos atributos.** iOS emite
**8** y Android **19**, con solo **5 comunes**:

| | Atributos |
|---|---|
| Comunes (5) | `index`, `class`, `text`, `enabled`, `bounds` |
| Solo Android (14) | `resource-id`, `package`, `content-desc`, `checkable`, `checked`, `clickable`, `focusable`, `focused`, `scrollable`, `long-clickable`, `password`, `selected`, `hint`, `displayed` |
| Solo iOS (3) | `accessibility-id`, `label`, `visible` |

Lo que esto rompe, en concreto:

- **iOS no tiene `resource-id`**, que es con lo que en Android se nombran las piezas de un
  diálogo (`android:id/button1`…). Un guion que localice botones así **no tiene equivalente**:
  en iOS se localizan por `class`, por `accessibility-id` o por `label`.
- **iOS no tiene `content-desc`** ni **ninguno de los booleanos** (`checkable`, `clickable`,
  `scrollable`, `password`…). Preguntar "¿es scrollable?" por el volcado no se puede; lo que hay
  es la respuesta de `scroll`, que dice si había ancestro y en qué eje.
- iOS añade `xone-name` / `xone-type` cuando la vista es un control XOne — eso sí es el puente
  entre los dos formatos, y es por donde se cruza un volcado con el otro.

**En iOS el nombre canónico es `uikit`.** `uiautomator` se acepta como **alias** para que una
llamada multiplataforma no falle, pero **devuelve datos con forma de iOS**: pedir `uiautomator` a
un dispositivo iOS no te da el volcado de Android, te da el de iOS con otro nombre. Es la
situación **contraria** a la de `getCurrentScreen`, donde el campo conserva el nombre `activity`
porque el contenido sí cumple el mismo papel (divergencia 9).

### `getCurrentScreen` — las dos plataformas

En qué pantalla estás, sin traerte el volcado entero. Es lo primero después de cada navegación.

**Entrada:** `command`, y nada más — es una pregunta por el estado, no por un control.
**Salida:** `ResultMessage(string)` con un objeto JSON dentro de `status`, **siempre con los
cinco campos** (vacíos si hace falta):

| Campo | Qué es |
|---|---|
| `app` | La app XONE cargada |
| `activity` | La pantalla al frente (**(iOS)** el nombre de CLASE del controlador: `EditViewController`, `CollectionViewController`…) |
| `collection` | La colección que esa pantalla edita o lista |
| `dialogs` | Los diálogos encima, de abajo arriba, cada uno con `name` y `modal`. **(iOS)** un **toast** sale aquí, y `activity`/`collection` pasan a ser las suyas: lectura e interacción responden por la misma pantalla |
| `window` | La ventana que se lleva los toques. **(iOS)** con un toast delante es la suya; las ventanas del **sistema** (el teclado, el *tracking* de UIKit) **no** se listan y siguen contadas dentro de `activity` — publicarlas volvía este campo no determinista entre apps |

```
$ curl -sk -X POST $B -d '{"command":"getCurrentScreen"}'
{"result":true,"status":"{\"activity\":\"EditViewController\",\"app\":\"FontIconsApp\",
 \"collection\":\"TestApp\",\"dialogs\":[{\"modal\":true,\"name\":\"MapCollController\"}],
 \"window\":\"MapCollController\"}"}
```

**Error:** `"App is not running"` — y se decide por el proyecto XONE cargado, **no** por que haya
pantalla: con app cargada y sin pantalla al frente contesta `result:true` con `activity` y
`collection` **vacíos**, que es otro hecho y lleva a otro sitio.

- **(iOS)** `activity` conserva el nombre del campo de Android aunque en iOS no haya actividades
  (divergencia 9). Su VALOR es el nombre de la clase del `UIViewController`, y sirve para lo
  mismo: saber en qué camino de render estás, o sea qué comandos van a funcionar.
- **(iOS)** `dialogs` **solo lista desde el modal de más arriba hacia arriba** (divergencia 8).

### `getScreenshot` — las dos plataformas

**Entrada:** `command`; **(iOS)** `format` opcional, `jpeg` (default) o `png`.

Android: `ResultMessage(base64WebP)` → base64 de un WebP con pérdida al 50%.
**(iOS):** `{result:true, status:"<base64>", imageFormat:"jpeg"|"png"}` — **iOS no puede
codificar WebP** (`ImageIO` lo decodifica pero no lo escribe). Y la captura **no incluye** cámara
en vivo, capas Metal/GL, teselas de mapa ni la barra de estado del sistema.

Sirve para **enseñar** un estado a una persona. No es una prueba de que algo funcione.

### `getText` — las dos plataformas

**Entrada:** `command`, `name`. **Salida:** `ResultMessage(texto)`.
**Error:** `"Element '<name>' not found"`.

- **(iOS)** añade `source`: `"field"` cuando el valor sale del campo de datos del control,
  `"view"` cuando el control no tiene campo y se cae al texto visible. Un control **con** campo
  siempre responde `source:"field"`, aunque el valor esté vacío — así se distingue "campo vacío"
  de "control sin campo".
- **(iOS)** sobre un contenedor (`frame`) devuelve el primer texto visible que encuentra dentro,
  con `source:"view"`.
- **(iOS)** dentro de una fila (`row`/`content`/`where`) devuelve el **campo**, no lo pintado, con
  `source:"field"` — igual que Android.

### `getUiAttribute` — las dos plataformas

Lee un atributo del **nodo XML de definición**, no el valor en runtime.

**Entrada:** `command`, `collectionName`, `nodeType` (p.ej. `"prop"`), `name`, `attributeName`.
**Salida:** `ResultMessage(valor)`; si el atributo no existe, `status` es `""` con `result:true`.

- **(iOS)** los dos caminos **no son equivalentes**. Con `nodeType` distinto de `prop` se lee el
  atributo **literal** del XML. Con `nodeType="prop"` se pasa por `FieldPropertyValue`, que aplica
  las cascadas del motor (overrides de plataforma, reglas CSS de clase, herencia de la colección
  padre) **y el fallback de título del bug F11113001**: pedir el `title` de un prop que no lo
  tiene devuelve el **nombre del prop**. Es lo que ve el motor al pintar, no el texto del fichero.

### `isVisible` / `isEnabled` — las dos plataformas

**Entrada:** `command`, `name`. **Salida:** `ResultMessage("true")` o `ResultMessage("false")` —
el booleano viaja como **string** en `status`.

- **(iOS)** `isVisible` mira el `isHidden`/`alpha` del control **y de todos sus ancestros**, que
  esté en una ventana, y la intersección real con el scroll contenedor.
- **(iOS)** `isEnabled` combina `isUserInteractionEnabled` con los flags de XOne (`readonly`,
  `locked`, `disableedit`), que son los que de verdad deciden si el motor deja tocar el control.
- **(iOS)** un prop `visible="0"` responde `not found`, no `"false"`.
- **(iOS)** sobre una fila que no está pintada responden `"Element '<name> row N' not found"`, **no
  `"false"`**: "no lo veo porque está fuera de la ventana" no es lo mismo que "está y no se ve", y
  lo primero se arregla desplazando la lista.

### `waitForElement` — las dos plataformas

**Entrada:** `command`, `name`, `timeout` en ms (default `10000`).
**Salida:** `ResultMessage()` cuando el elemento se vuelve visible.
**Error:** `"Timeout waiting for element '<name>'"`. Polling cada 250 ms en las dos.

- **(iOS)** acepta `row`/`content`/`where`, y entonces espera a que **la fila esté pintada**
  (regla 3 de [Apuntar a una fila](#apuntar-a-una-fila)). No es una espera a que la colección
  cargue.

### `getRows` — las dos plataformas

Las filas de un content: **todas las que tiene, estén o no pintadas**. Es lo contrario del
volcado del árbol —que solo describe lo que hay montado como vista— y por eso existe: comprobar
el contenido de una lista era lo único del bloque que obligaba a escribir un guion a mano.

**Entrada:** `content` (obligatorio), `fields` (obligatorio), `limit` (default `100`, negativo =
todas), `offset` (default `0`).

`fields` admite las tres formas: array (`["A","B"]`), valor suelto (`"A"`) y lista separada por
comas (`"A,B"`). Se pide **explícitamente** porque leer un campo puede evaluar una fórmula: no
hay "todos los campos".

**Salida:** `ResultMessage(string)` con un objeto JSON dentro de `status`, **siempre con los
cinco campos**: `content`, `collection`, `count`, `offset`, `rows`. Cada fila lleva su `row` (el
índice de la colección, el mismo que aceptan los doce comandos) y el valor de cada campo pedido.

```
$ curl … -d '{"command":"getRows","content":"MAP_CONTENT","fields":["MAP_NAME"],"limit":5}'
{"result":true,"status":"{\"collection\":\"LottieFiles\",\"content\":\"MAP_CONTENT\",\"count\":13,
 \"offset\":0,\"rows\":[{\"MAP_NAME\":\"scan qr code success\",\"row\":0}, …]}"}
```

**`count` es el de la colección ENTERA**, no el de lo devuelto ni el de lo pintado. Las tres
cifras son distintas y esa es la gracia: en FontIconsApp/LottieAnimation el volcado publicaba 8
filas pintadas, `count` decía 13 y esa llamada devolvió 5.

Un campo **sin valor** sale como `null` **con su clave puesta**; un campo que **no existe** es un
error con su nombre y su colección. No se confunden.

**Errores:** `"Missing parameter 'content'"` · `"Missing parameter 'fields'"` (también con
`fields: []`) · `"Element '<name>' not found"` (no hay nada con ese nombre) ·
`"Element '<name>' is not a content, it has no 'contents' attribute"` (el nombre es de otra cosa)
· `"Element '<name>' has no data yet"` (el content existe pero aún no ha montado su lista —
espera, no corrijas el comando) · `"Content '<name>' is ambiguous: more than one content on this
screen carries that name"` **(iOS)** · `"Field 'X' does not exist in collection 'Y'"` ·
`"App is not running"`.

- **(iOS)** el `offset` que devuelve es el **ACOTADO, no el pedido**: sobre 13 filas,
  `offset:900` contesta `offset:13` y `rows:[]` (y `offset:-5` contesta `offset:0`). Pedir una
  página que no existe es una pregunta legítima, y la respuesta dice exactamente lo que pasó —
  pero **no confirmes un offset comparándolo con el que mandaste**: no es el mismo número.
- **(iOS)** `limit:-1` sobre una colección grande puede **tardar**, y si pasa de los 5 s de tope
  del hilo principal contesta `"UI is busy"` **mientras el trabajo sigue corriendo** (el bloque ya
  empezado termina). Reintentar en ese momento encola una segunda lectura sobre un main ocupado:
  espera, o pagina con `limit`/`offset`.
- **(iOS)** los nombres de CAMPO distinguen mayúsculas (`MAP_IMAGE` ≠ `map_image`), aunque los
  de CONTROL no. El motor los compara con `strcmp`.

---

## Tocar

En Android estos comandos **inyectan eventos reales** (`MotionEvent`, `KeyEvent`) o llaman a
`performClick()`/`performLongClick()`. **En iOS no se puede inyectar nada** sin API privada, así
que se invoca el manejador del propio control.

Todos menos `pressKey` piden `name` y aceptan `row`/`content`/`where`
([Apuntar a una fila](#apuntar-a-una-fila)). Sin `name`: `"Missing parameter 'name'"`. Las
consecuencias, todas medidas:

| Comando | Entrada | Nota (iOS) |
|---|---|---|
| `click` | `name` | Invoca la acción del control |
| `tap` | `name` | **Colapsa en `click`.** Sobre un control que existe pero está deshabilitado **se niega** (Android inyectaría el toque y diría éxito) |
| `doubleTap` | `name` | **Siempre** `"Element '<name>' has no double tap gesture"`: el runtime iOS no tiene ese evento XONE. No se simulan dos `click` |
| `longPress` | `name` | **Siempre** `"Element '<name>' has no long click handler"`: solo las filas de lista escuchan pulsación larga, un prop o un frame no |
| `openSelector` | `name` | **Abre el desplegable** de un control (`mapcol`/`linkedto`, o el selector de fecha/hora). **ABRE, no elige**: lo que salga después se recorre con `getCurrentScreen`, `getAllElements` y `click` con `row` |
| `fill` | `name`, `value` (default `""`) | Escribe por el camino real de commit del campo, así que dispara los mismos eventos XONE que una pulsación |
| `clear` | `name` | Igual que `fill` con valor vacío |
| `scroll` | `name`, `direction` (default `down`), `amount` px (default 300) | Mueve de forma **síncrona** (sin animación, para que un `getAllElements` inmediatamente después ya vea el resultado) el `UIScrollView` **ancestro que pueda moverse en el eje pedido**, con clamp. Si el eje sí desborda pero ya estás en el límite, responde `true` sin mover: el contenido no puede ir más allá, igual que un swipe en Android |
| `pressKey` | `keyCode` (int) o **(iOS)** `key` simbólico (`back`, `enter`, `done`) | Solo `4`/`back` (volver atrás) y `66`/`enter` (confirmar el campo con foco); otro código → `"Key <n> has no iOS equivalent"`. Sin `keyCode` válido, `"Argument 'keyCode' is missing or invalid"`. En la pantalla **raíz** el atrás se niega con `"Cannot go back: '<pantalla>' is the root screen"` en vez de fingir, y con una acción en curso contesta `"UI is busy"` |

Que `click` responda `result:true` significa **que se invocó el manejador**, no que hubiera un
efecto visible: la lógica del control puede decidir no hacer nada, igual que con un toque real.
Comprueba el efecto con un dato.

### El catálogo de errores, desdoblado **(iOS)**

Un control **ausente** ya NO se confunde con uno **intocable**. Antes había tres mensajes
fundidos (`not found or not enabled`, `not found or not editable`, `not found or not clearable`)
y el cliente no podía saber si corregir el nombre o rellenar antes la pantalla. Ahora cada
mensaje dice UN hecho:

| Mensaje | Qué pasó | Qué arregla |
|---|---|---|
| `Element 'X' not found` | No existe en ninguna pantalla alcanzable | Corregir el nombre, o navegar |
| `Element 'X row N' not found` | El control existe, la FILA no está pintada | Desplazar la lista, o `getRows` |
| `Element 'X' is not enabled` | Existe y está deshabilitado | Rellenar antes la pantalla / esperar |
| `Element 'X' has editing disabled` | Es de los que se escriben, pero bloqueado (`locked`/`readonly`/`disableedit`) | Desbloquear en la app: escribirlo desde aquí fabricaría un defecto que el usuario no puede provocar |
| `Element 'X' is not editable` | Existe pero NO es de los que se escriben (botón, imagen, content) | Apuntar a otro control |
| `Element 'X' is not clearable` | Lo mismo, pedido por `clear` | Apuntar a otro control |
| `Element 'X' is editable, but this channel cannot write a multiline\|date/time field` | El usuario SÍ puede editarlo; el que no puede es **este canal** | Nada por tu parte: es un límite del canal (divergencia 7) |
| `Element 'X' has no click handler` | Existe y está habilitado, pero nadie escucha su click | Apuntar al control que sí tiene manejador |
| `Element 'X' has no long click handler` | `longPress` sobre un prop o un frame | — |
| `Element 'X' has no double tap gesture` | `doubleTap`, siempre | — |
| `Element 'X' has no selector to open` | `openSelector` sobre algo sin desplegable | Apuntar al prop que lo tiene |
| `Element 'X' has its selector button disabled` | El control está bien y el que no deja es el BOTÓN. Caso medido: el desplegable ya está abierto, y el runtime apaga su propio botón mientras dura | Cerrar lo abierto, o esperar |
| `Element 'X' is not inside a scrollable view` | `scroll` sin ningún ancestro desplazable | — |
| `Element 'X' has no scrollable ancestor on the vertical\|horizontal axis` | Hay scroller, pero no se mueve en ESE eje (el caso típico: un carrusel horizontal y le pides vertical) | Pedir el otro eje |
| `Element 'X' is ambiguous, pass 'content' to choose between 'A', 'B'` | El nombre resuelve en dos contents | Pasar `content` |
| `Field 'F' does not exist in collection 'C'` | El `where` (o los `fields` de `getRows`) nombran un campo que no está | Corregir el campo, no la fila |

`openSelector` contesta además `"Element 'X' has editing disabled"` cuando el control entero está
bloqueado: es el MISMO hecho que en `fill`, así que lleva el mismo mensaje.

### En qué ORDEN se busca un control **(iOS)**

La interacción busca **primero lo que está ENCIMA** de la pantalla actual —diálogos, toasts,
popovers—, de arriba abajo, y **la pantalla al final**. Un diálogo tapa la pantalla: si publica
un control con el mismo nombre, es el suyo el que recibiría el toque de una persona.

- **Alcanzar un control tapado nombrándolo sigue permitido**: la pantalla no se quita de la
  lista, se pone la última. Lo que cambió es el orden, no lo alcanzable.
- **Los niveles ANTERIORES de navegación NO se buscan.** XONE navega *presentando*, así que la
  pila de presentación es la pila de navegación entera: buscar en ella haría que un `fill` sobre
  una pantalla que ya dejaste atrás contestara `result:true`. Un `not found` sobre un control de
  la pantalla anterior es la señal de que **todavía no has navegado** — no un fallo del canal.
- **La LECTURA responde por lo mismo que el toque.** `getAllElements` y `getCurrentScreen` usan la
  misma noción de "lo que está encima" que la búsqueda, así que con un **toast** delante el volcado
  lista los props del toast, `collection` es la suya, y el toast sale en `dialogs` y en `window`.
  Importa porque durante un tiempo no fue así: el toque caía en el toast y el volcado describía la
  pantalla de debajo, de modo que no había forma de enumerar el control sobre el que estabas
  actuando. Un toast **no se presenta** —se monta como raíz de otra ventana—, y esa es la razón por
  la que las dos mitades llegaron a divergir.
- **Queda una asimetría, y el canal la dice en vez de fingirla:** con una **lista de menú** delante,
  la lectura contesta por ella (`activity: CollectionViewController`) y el volcado `xone` responde
  `Screen '...' is not readable by the 'xone' format`, mientras la interacción sigue buscando en la
  pantalla de debajo. No hay forma de buscar dentro de ese controlador; preferimos decirlo.

---

## Ciclo de vida de la app

### `launchApplication` — las dos plataformas
Lanza una app XOne por nombre. En Android limpia la caché de imágenes antes de lanzar.
**(iOS)** es un comando **legado**: solo por WebSocket, no por `POST /command`.

### `exitApplication` — solo Android
### `directdownload` — las dos plataformas
Descarga un proyecto desde el cloud. Ver el detalle del flujo y del formato de respuesta del
servidor cloud en la documentación del framework.

### `status` / `state` — las dos plataformas
Estado de la conexión y del despliegue.

---

## Colecciones y atributos

### `loadCollection` — las dos plataformas
Carga o recarga una colección XML en caliente. **Entrada:** `xmlNode` (XML en **Base64**),
`encoding` (default `ISO-8859-15`). **Error:** `ResultMessage(exception)` si el XML es inválido;
`"App is not running"` si la app no está iniciada.

### `setAttribute` — las dos plataformas
**Entrada:** `collectionName`, `nodeType`, `name`, `attributeName`, `attributeValue`. Provoca
relayout o refresh según el atributo. **(iOS)** también es legado: solo WebSocket.

### `deleteAttribute` — las dos plataformas
**Entrada:** `collectionName`, `nodeType`, `name`, `attributeName`.

### `loadIncludeFile` — solo Android
`file`, `language`, `encoding` (default UTF-8), `delayCompilation`, `compile`.
**Error:** `"Cannot load include file <nombre>"`.

### `replaceProperty` — solo Android
`attributeNames[]` + `attributeValues[]` en el mismo orden.

### `setCssAttribute` / `deleteCssAttribute` — solo Android
`fileName`, `className`, `attributeName` (+ `attributeValue` en el set).

### `refresh` / `relayout` — solo Android
En iOS las ramas existen en el dispatcher pero están **vacías**: no hacen nada.

---

## Ficheros

### `listAppFiles` — las dos plataformas
**Entrada:** `appName`. **Salida:** `ListDirectoryMessage` con `paths`.

### `uploadFile` — solo Android
`destinationPath` (relativa al directorio `data/` de la app), `fileData` en **Base64**.

### `getFileChecksum` — solo Android
`appName`, `files[]`, `checksumType` (default `crc32`). Ojo: en su respuesta, `result` es un
**objeto** `{fichero: checksum}`, no un booleano.

---

## Scripts y base de datos — solo Android

- **`runScript`**: `scriptLanguage`, `scriptText` en Base64. Devuelve el valor de retorno como
  string, o `ResultMessage(exception)`. Errores: `"No edit view is visible"`,
  `"No data object found..."`.
- **`runSql`**: `appName`, `sql`. Devuelve `SqlMessage` con `data` como array de filas.
- **`getDatabaseTableNames`**: `appName`. Ejecuta `SELECT name FROM sqlite_master WHERE type='table'`.
- **`queryDatabaseTable`**: `appName`, `tableName`. Ejecuta `SELECT * FROM <tableName>`.

En iOS no existen. Nota adicional: el `.xcframework` de SQLCipher del repo solo trae slice
`x86_64` para simulador, así que una app con base de datos cifrada falla en tiempo de ejecución
en simulador aunque estos comandos existieran.

---

## Logs — solo Android

- **`getLog`**: volcado completo (logcat + info básica) en `FullLogMessage`.
- **`enableDeviceLogging`** / **`disableDeviceLogging`**: push de cada línea del logger interno
  de XOne como `LoggerMessage`.
- **`setLogEnabled`** / **`setLogDisabled`**: streaming continuo del logcat del sistema (un hilo
  lo lee cada 3 s y envía las líneas nuevas).

Déjalos desactivados al acabar.

---

## Edición en vivo — solo Android

`enableLiveEditionMode` / `disableLiveEditionMode`: arrastrar y soltar controles para cambiar
`lmargin`, `tmargin` y `frame` en caliente; al soltar, envía un `UpdateNodeMessage` push con
`{ command: "updateNode", collectionName, nodeType, name, attributeNames[], attributeValues[] }`.

---

## Mock de hardware — solo Android

`setMockData` alimenta al framework con datos simulados de GPS, NFC y cámara sin hardware real;
todos los campos son opcionales (`latitude`, `longitude`, `altitude`, `accuracy`, `bearing`,
`speed`, `date`, `tagId`, `payload`, `imageData` en Base64). Varios tipos pueden estar activos a
la vez y cada subsistema consume solo los campos que le corresponden. `clearMockData` los quita
y el framework vuelve al hardware real: **hazlo al acabar**.

---

## Depurador JavaScript — solo Android

`debug` es un contenedor cuyo campo `action` elige el subcomando: `init`, `end`, `breakpoints`,
`break`, `go`, `stepInto`, `stepOver`, `stepOut`, `expand`, `eval`, `inspect`, `addBreakpoint`,
`removeBreakpoint`. Devuelve `DebugMessage`; los mensajes de pausa llegan asíncronos por el
listener que registra `init`.

**Por qué no está en iOS:** el motor de scripting iOS es **JavaScriptCore**, que no expone API
pública de depuración — no hay dónde colgar un breakpoint. Las salidas serían instrumentar el
fuente antes de evaluarlo o hablar el protocolo del Web Inspector, y ninguna se ha hecho.

---

## Mensajes que solo existen en iOS

Los mensajes propios de iOS, reunidos aquí porque un cliente de Android no los espera:

| Mensaje | Cuándo |
|---|---|
| `"UI is busy"` | El hilo principal no atendió el comando dentro del tope de 5 s. **El trabajo puede seguir corriendo**: un bloque que ya había empezado termina aunque tú ya tengas la respuesta |
| `"Element '<name>' is not inside a scrollable view"` | `scroll` sobre algo sin ningún ancestro scrollable |
| `"Element '<name>' has no scrollable ancestor on the <eje> axis"` | Hay scroller encima, pero no puede moverse en el eje pedido |
| `"Key <n> has no iOS equivalent"` | `pressKey` con un código que no es 4 ni 66 |
| `"Element '<name>' has no double tap gesture"` | `doubleTap`, siempre |
| `"Cannot go back: '<pantalla>' is the root screen"` | `pressKey 4` en la pantalla raíz |
| `"No field has the focus"` | `pressKey 66` sin ningún campo con el foco |
| `"The focused field refused to release the focus"` | `pressKey 66` con un campo que no suelta el foco (un delegado que valida y rechaza): el commit **no** ha pasado |
| `"Element '<name>' is editable, but this channel cannot write a <clase> field"` | `fill`/`clear` sobre un memo multilínea o un campo de fecha/hora |
| `"Element '<name>' has no selector to open"` / `"... has its selector button disabled"` | `openSelector` |
| `"Element '<name>' is ambiguous, pass 'content' to choose between 'A', 'B'"` | El nombre resuelve en dos contents **de nombres distintos**. El mensaje trae los dos, entrecomillados y en orden estable, para copiarlos al comando siguiente |
| `"Element '<name>' is ambiguous: the same name resolves in more than one content, and 'content' cannot choose between them"` | Los dos contents **se llaman igual**, así que pasar `content` no desempata. Existe para no mandarte a hacer lo que ya hiciste |
| `"Content '<name>' is ambiguous: more than one content on this screen carries that name"` | Lo mismo visto desde `getRows`, que nombra el content directamente en vez de un control de dentro |
| `"Element '<name>' has no data yet"` | `getRows` sobre un content que todavía no ha montado su lista |
| `"Screen '<clase>' is not readable by the 'xone' format"` | Hay app corriendo, pero su pantalla es de un camino de render que el formato `xone` no lee. **No confundir con `"App is not running"`** |
| `"Missing parameter '<x>'"` | Falta un parámetro que se nombra: `name` —los doce comandos **y `getUiAttribute`**—, y `content` y `fields` de `getRows` |
| `"Argument '<x>' is missing or invalid"` | El resto: `keyCode`, un `where` mal formado, y `collectionName` / `nodeType` / `attributeName` de `getUiAttribute`. **Su `name` no**: ese sale por `Missing parameter`, como en todos los demás — es propiedad del parámetro, no del comando que lo pide |
| `"Unknown command '<x>'"` y `"Invalid JSON"` | Android no documenta respuesta para ninguno de los dos; iOS contesta, porque un comando sin respuesta deja al cliente esperando |
| `"Cannot serve a hotswap command from the main thread"` | El comando llegó EN el hilo principal: servirlo ahí sería esperarse a uno mismo |
| `"Field '<f>' does not exist in the collection"` | Variante **sin nombrar la colección** de `Field '<f>' does not exist in collection '<c>'`, para cuando no se puede saber cuál es: un `collection ''` mandaría a buscar una colección que no existe, y eso es peor que no decir cuál. Sale de una rama **viva** |
| `"Screen descriptor is not serializable"` / `"Rows payload is not serializable"` | `getCurrentScreen` / `getRows`. **Hoy son inalcanzables** —lo que compone esos payloads son String, Int y Bool— y existen para que esos caminos no tengan la opción de contestar `result:true` con un objeto vacío el día que dejen de serlo |

**Sobre `ResultMessage(exception)` en iOS:** los puntos de entrada están envueltos en
`@try/@catch` que emite esa forma, pero el `catch` envuelve una llamada que por dentro cruza una
frontera de GCD, y Apple documenta lanzar excepciones Obj-C a través de esa frontera como no
soportado. Es decir: **la red existe, pero puede no cubrir la clase de excepción para la que se
puso**. Pendiente de comprobar en un build aislado; hasta entonces, no des por hecho que una
excepción dentro de un comando te va a llegar como JSON.

---

## Divergencias con Android

Las once que hay que saber antes de escribir nada multiplataforma. Ninguna es una carencia que
se vaya a "arreglar": son consecuencias de la plataforma, y por eso están declaradas.

1. **Los volcados no son compatibles atributo a atributo.** 8 atributos en iOS, 19 en Android,
   5 comunes. Sin `resource-id`, sin `content-desc`, sin booleanos.
   [Detalle](#los-dos-volcados-no-son-compatibles-atributo-a-atributo).
2. **`has no click handler` va SIN la coletilla `use 'tap' to send a real touch`** con que
   Android remata el suyo. En iOS `click` y `tap` caen en la **misma función**, así que ese
   consejo manda a repetir la llamada que acaba de fallar: un callejón sin salida.
3. **`created` es SIEMPRE `true` en iOS.** No existe el objeto "declarado y sin construir": el
   motor descarta los props sin bit visible **antes** de crear su vista, y lo que crea lo crea
   entero antes de indexarlo (verificado en el código de iOS). **No filtres por `created` en
   iOS**: no descarta nada. *Que en Android `created:false` sí sea alcanzable —porque su montador
   de frames deja una vista con el nombre puesto— es lo que se dedujo al portar el campo; **no
   está verificado contra el código de Android**, así que no lo uses para ramificar sin
   comprobarlo allí.*
4. **`editDisabled` NO se emite en las filas.** Dentro de una fila no hay ningún
   `EditPropertyControl`, así que `fill` rechaza por otra vía (`is not editable`): publicar el
   campo ahí anunciaría un bloqueo distinto del que el canal va a alegar. *Se anotó como
   divergencia porque se dio por hecho que Android sí lo emite en las filas de una pantalla de
   lista, pero eso **no está en ninguna spec ni verificado contra su código**. Lo firme es el lado
   iOS: en una fila el campo no sale nunca. Si tu código multiplataforma lee `editDisabled` dentro
   de una fila, comprueba primero que Android lo ponga — en iOS esa rama está muerta.*
5. **`Content '<c>' does not have the collection '<n>'`** —error de `getRows` en el contrato de
   Android— **es INALCANZABLE en iOS.** Un `XoneTableContent` pinta **una sola** colección, así
   que no hay elección que el cliente pueda equivocar: el `collection` que devuelve el payload es
   informativo, no un parámetro. Si tu código ramifica por ese mensaje, en iOS esa rama está
   muerta.
6. **`getRows`:** el `offset` que devuelve es el **acotado, no el pedido** (`offset:900` sobre 13
   filas contesta `offset:13`); y `limit:-1` puede tardar y contestar `"UI is busy"` **mientras
   el trabajo sigue corriendo**.
7. **`.unsupportedField`:** un memo multilínea o un campo de fecha/hora contestan
   `Element 'X' is editable, but this channel cannot write a <clase> field`. **El usuario SÍ
   puede editarlos**; lo que no puede es este canal — el commit de un memo es asíncrono y no
   tiene versión síncrona pública, y el `onSetValue:` de un campo de fecha espera un `NSDate`.
   Se dice así, y no `is not editable`, porque lo segundo mandaría a cambiar de control y el
   control era el correcto.
8. **`dialogs` solo lista desde el modal de más arriba hacia arriba.** Consecuencia del corte
   modal: lo que queda debajo de un modal no se publica porque un toque no lo alcanzaría. Con
   dos diálogos encima, uno modal y otro no, solo sale el tramo alcanzable. Una pila entera de
   diálogos **no** modales sí sale completa.
9. **`getCurrentScreen` conserva el nombre de campo `activity`** aunque en iOS no haya
   actividades: el valor —el nombre de clase del controlador— cumple el mismo papel, y
   renombrarlo rompería el payload entre plataformas sin aportar nada. Es la situación
   **contraria** a la del formato del volcado, donde el contenido difiere de verdad y por eso el
   nombre difiere (`uikit`, no `uiautomator`).
10. **Las tres de siempre:** `getScreenshot` es **JPEG/PNG** (iOS no codifica WebP); `pressKey`
    solo mapea `back`(4) y `enter`(66); `doubleTap` y `longPress` **no tienen evento XONE** en
    props/frames, así que se niegan siempre.
11. **Orden de búsqueda:** primero lo que está **encima** (diálogos, toasts), la pantalla al
    final, y los niveles **anteriores** de navegación **fuera**.
    [Detalle](#en-qué-orden-se-busca-un-control-ios).

---

## Dos avisos operativos sobre el host iOS

Ninguno de los dos es del hotswap, pero los dos te los vas a encontrar:

- **`MyAllXOne` crashea al arrancar** en el host `XOneStudioSwift` (GoogleMaps,
  `preLaunchServices`: el host no trae los recursos de GoogleMaps). Para probar **filas**, el
  fixture usable es **`FontIconsApp`** (3 contents; `LottieAnimation` tiene 13
  filas sobre la colección `LottieFiles`).
- **El host se cae al abrir una lista de menú.** A `XOneStudioSwift.app` le faltan los
  `xone_img_*.png`, y `CollectionViewController`/`SortView` meten esas `UIImage` nil en arrays.
  Es un defecto **ajeno** al hotswap y anterior a él: si tu recorrido pasa por un menú, la app se
  va a caer. El síntoma es **conexión rechazada en el puerto**, no un `result:false` — no lo
  diagnostiques como un fallo del canal.
