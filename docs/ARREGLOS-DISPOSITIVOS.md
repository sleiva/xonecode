# Dispositivos: lo que está mal, y por qué

> Documento de trabajo, **no un arreglo**. Nada de lo que sigue está implementado.
> Medido el 17-09-2026 con el emulador `pixel8` **arrancado y respondiendo** (`emulator-5554`,
> `sys.boot_completed=1`), que es la situación en la que los defectos se ven.

## El síntoma en una frase

xonecode dice que `pixel8` está **apagado** mientras está **arrancado**, y lo enseña **dos
veces**: una como «sdk gphone64 arm64 · arrancado» y otra como «pixel8 · apagado».

## Lo que hay de verdad en la máquina

| qué | valor medido |
|---|---|
| AVDs definidos (`emulator -list-avds`) | `pixel8` — **también con el emulador arrancado** |
| Aparatos conectados (`adb devices -l`) | `emulator-5554  device  model:sdk_gphone64_arm64` |
| `ro.product.model` del aparato | `sdk_gphone64_arm64` |
| **A qué AVD pertenece ese `emulator-5554`** | **`pixel8`** |

Esa última fila es la que faltaba, y se puede preguntar —medido, las dos formas contestan lo
mismo—:

```sh
adb -s emulator-5554 emu avd name                        # → pixel8\nOK
adb -s emulator-5554 shell getprop ro.boot.qemu.avd_name # → pixel8
```

El **único** dato que ata un `emulator-5554` a su AVD es el **serial/puerto**. El nombre del
AVD no aparece en `adb devices` por ningún lado: la imagen `google_apis` pone
`model:sdk_gphone64_arm64`, y `pixel8` sólo existe como nombre de carpeta en `~/.android/avd`.

---

## Defecto 1 — El emparejamiento AVD ↔ emulador se hace por NOMBRE, y no puede acertar

`apps/web/src/inventarioDeDispositivos.ts:35-38`:

```js
const arrancados = new Set(medidos.map((d) => d.nombre));
const deAvds: Dispositivo[] = informe.avds
  .filter((a) => !arrancados.has(a))
  .map((a) => ({ id: `avd:${a}`, nombre: a, plataforma: "android", clase: "emulador", estado: "apagado" }));
```

Los dos lados del `has()` no pueden coincidir nunca:

| lado | de dónde sale | valor real |
|---|---|---|
| `medidos[].nombre` | `model:` de `adb devices -l`, con `_`→espacio (`src/core/dispositivos.ts:526-529`) | `sdk gphone64 arm64` |
| `informe.avds[]` | `emulator -list-avds` (`src/core/dispositivos.ts:544`) | `pixel8` |

`arrancados` acaba siendo `{"sdk gphone64 arm64"}`, se le pregunta por `"pixel8"`, no está, y el
AVD **arrancado** se añade igualmente como «apagado». El filtro no filtra: **el fantasma sale
siempre**.

El comentario del propio fichero (líneas 31-34) describe la intención correcta —«solo los que no
estén ya arrancados, que sí vienen de adb con su propio serial»— y el código no la cumple.

**Coste**: dos filas para un aparato, una de ellas afirmando lo contrario de la verdad. Y el
daño llega más lejos que la pantalla, porque el mismo inventario alimenta **la pastilla del
compositor**, que es donde se ELIGE el aparato (defecto 3).

**Por qué el suite está verde**: `Ajustes.test.tsx:565` prueba que un AVD apagado se lista —es
cierto y está bien probado— con un fixture (`avds: ["Pixel_8_API_34"]`) cuyos aparatos de adb no
pueden llamarse así. **El caso «AVD arrancado» no puede ponerse rojo con este código**, porque no
existe ningún nombre que haga funcionar el filtro. No falta un test: la costura que se probaría
está muerta.

**Costura**: medir el nombre del AVD en el HOST y ponerlo en el `Dispositivo` (un campo
`avd?: string`, sólo para `clase === "emulador"`), de modo que el cliente compare ese campo y no
el nombre visible. El cliente **no puede** resolverlo solo: no habla con la máquina, y su copia
del tipo del cable está declarada a propósito (`apps/web/src/tipos.ts`).

---

## Defecto 2 — Hay DOS inventarios, y no dicen lo mismo

| consumidor | qué mira | un AVD apagado |
|---|---|---|
| Ajustes → Dispositivos (`Ajustes.tsx:945`) y la pastilla del compositor | `inventario()` — **con** los AVDs | se **lista** |
| «Tu equipo» (`Equipo.tsx:186-190`, `:245`) y el **servidor** (`arranque.ts:3456`, `:3735`) | `informe.dispositivos` a pelo — **sin** AVDs | se **cuenta** / no consta |

Los dos comportamientos están escritos como deliberados y por separado, pero nadie los ha
comparado: «Tu equipo» tiene un comentario que dice que los apagados se cuentan justamente
porque 35 filas iguales no dicen nada (y ahí, con iOS, es verdad), mientras Ajustes los lista
todos «porque es donde se elegirá uno».

El resultado es que el mismo hecho se cuenta de dos maneras en dos sitios de la misma ventana, y
`pixel8` **no consta** en el panel «Tu equipo» aunque el panel sí nombre los 35 simuladores iOS.

---

## Defecto 3 — La fila fantasma lleva un id que NADIE resuelve

`inventarioDeDispositivos.ts:38` inventa `id: "avd:pixel8"`, y ese prefijo **sólo existe en esa
línea** (comprobado recorriendo `src/` y `apps/web/src/`). El servidor resuelve el aparato
elegido contra `informe.dispositivos`, que no contiene AVDs (`arranque.ts:3456`):

```js
const d = informeDeDispositivos?.dispositivos.find((x) => x.id === pedido);
if (d !== undefined) { abierta.elegirDispositivo({ id: d.id, ... }); }
```

Y la pastilla ofrece la fila **sin mirar el estado** (`PastillaDeDispositivo.tsx:79`,
`onClick={() => elegir(d.id)}`). Así que elegir «pixel8» no encuentra nada, no hace nada y **no
lo dice**: el patrón de «un control sin dato detrás» que el resto del repo persigue
explícitamente. `dispositivoDeLaSesion` queda igual de mudo: `{ dispositivo: undefined, elegido:
"avd:pixel8" }` (`arranque.ts:3735`).

**Qué decidir** (esto es diseño, no medida): un AVD apagado no puede recibir la app —no hay
aparato al que hablar—, así que lo honesto es **o** ofrecerlo como no elegible en la pastilla, **o**
que el servidor conteste que ese id no resuelve. Lo que no vale es el silencio actual.

---

## Defecto 4 — Un emulador Android arrancado se pinta en gris

Los dos parsers dan **nombres distintos al mismo hecho**:

| parser | aparato encendido → estado |
|---|---|
| `parsearAdbDevices` (`src/core/dispositivos.ts:518-525`) | `conectado` (Android) |
| `parsearSimctl` (`src/core/dispositivos.ts:578-579`) | `arrancado` (iOS) |

El tipo admite los dos a propósito (`src/core/dispositivos.ts:91`: «`conectado` y `arrancado`
son los dos estados en que SE LLEGA al dispositivo»). El defecto es del **render**: la lista de
«Simuladores y emuladores» decide el color con `d.estado === "arrancado"` (`Ajustes.tsx:996`)
—y ahí un emulador Android **nunca** entra, porque viene como `conectado`—, mientras la lista de
teléfonos usa `d.estado === "conectado"` (`Ajustes.tsx:965`). Así que el emulador arrancado sale
con **punto gris** (`data-herramienta="otro"`) y la etiqueta «conectado», en una lista donde iOS
sí pone el verde. Mismo árbol, mismo vocabulario partido en dos.

---

## Lo que NO es un defecto (y conviene no «arreglar»)

- **`emulator` fuera del PATH y `ANDROID_HOME` sin poner.** Está confesado a propósito en el
  `aparte` de la receta (`src/core/dispositivos.ts:344-357`): «xonecode NO lo necesita —ya mira
  la carpeta de Homebrew para encontrar el SDK—: esto es para que `emulator` y `adb` te funcionen
  en tu terminal». La medida lo cumple: `enSdk("emulator", "emulator")` lo encuentra en
  `/opt/homebrew/share/android-commandlinetools/emulator/emulator`
  (`dispositivosEnMaquina.ts:148-156`).
- **Que la lista de «Tu equipo» cuente los apagados.** Es una decisión escrita y razonada; el
  defecto 2 es que **la otra** lista los enumere, no cuál de las dos tiene razón.
- **Que arrancar un emulador no esté cableado.** Se dice en la propia receta
  (`src/core/dispositivos.ts:358-362`) y en la interfaz no se promete botón.

## Un hermano del mismo árbol, latente

El paso 3 de la receta se marca hecho con **cualquier** AVD
(`src/core/dispositivos.ts:325`, `hecho: estado.avds.length > 0`), pero el comando crea uno
llamado `pixel8` (`:323`) y el texto de después manda a `emulator -avd pixel8` (`:360-361`). Con
un AVD de otro nombre la receta saldría **completa** y el comando ofrecido no existiría. Hoy no
afecta (el AVD se llama `pixel8` y los tres pasos están hechos de verdad), pero es la misma
forma de fallo: un paso que se cree cumplido por un dato que no es el que usa.

---

## Orden sugerido, y por qué en ese orden

1. **Defecto 1 (el emparejamiento)**, porque es la causa de los otros: mientras el fantasma
   exista, cualquier arreglo del 3 trabaja sobre una fila que no debería estar.
2. **Defecto 3 (el id mudo)**, ya con el fantasma reducido a su caso legítimo (AVD apagado y
   nada más), y con una decisión de diseño tomada.
3. **Defecto 4 (el gris)**, que es de una línea y no depende de los otros.
4. **Defecto 2 (los dos inventarios)**, que no se arregla codeando sino decidiendo qué contesta
   cada panel, y por eso va último.

**Lo primero que hay que escribir es un test que pueda ponerse ROJO**: el fixture tiene que
incluir un AVD que **sí** esté arrancado —con su serial de adb y su nombre de AVD— y exigir que
salga **una sola vez**. Con el código de hoy ese test no se puede escribir sin que la costura
exista antes, que es justo la señal de que el defecto 1 es real.

## Lo que hay que medir antes de tocar el host

`adb -s <serial> emu avd name` y `getprop ro.boot.qemu.avd_name` contestan lo mismo (medido), y
hay que elegir uno. Consideraciones de la casa:

- `getprop` usa el mismo molde que ya está en el fichero (`dispositivosEnMaquina.ts:539`, el
  `ro.product.model` de VERIFICAR), pero es un dato de la IMAGEN y podría no existir en un
  emulador de terceros.
- `emu avd name` es la consola del emulador y siempre existe en un emulador arrancado por adb,
  pero es otra superficie que no se usa todavía en el repo.

Y hay que decidir si esa llamada se hace **para cada** emulador conectado en cada medida (hoy
sería 1) o se deja fuera del camino crítico, porque la regla de esta pantalla es que medir
cuesta procesos en el equipo del usuario.
