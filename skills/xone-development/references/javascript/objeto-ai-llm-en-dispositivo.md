# XOne JavaScript — Objeto ai: LLM generativo en el dispositivo

> Fuente: `xone/v2/xone-help-docs/topics/08-objeto-ai.md` §1–§13. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §1 flujo típico · §2 downloadModel · §3 canLoadModel · §4 getModelInfo · §5 loadModel/unload · §6 generate · §7 chat con streaming · §8 cancelar y reiniciar · §9 herramientas y function calling · §10 loadSkills · §11 formatos de imagen y audio · §12 parámetros recomendados Gemma 4 y decodificación especulativa · §13 buenas prácticas y problemas comunes

---

## 1. Flujo típico

```js
// 1) Descargar el modelo (una vez; queda guardado en el dispositivo)
ai.downloadModel({
    repository: "litert-community/gemma-4-E2B-it-litert-lm",
    file: "gemma-4-E2B-it.litertlm",
    onProgress: function (percent) { ui.showToast("Descargando: " + percent + "%"); },
    onComplete: function (file) { cargarModelo(file); },
    onError: function (msg) { ui.msgBox(msg); }
});

function cargarModelo(file) {
    // 2) Cargar en memoria
    ai.loadModel({ path: file, backend: "GPU" });
    // 3) Generar
    var respuesta = ai.generate({ prompt: "Resume en una frase qué es XOne." });
    ui.msgBox(respuesta);
    // 4) Liberar memoria cuando se termine
    ai.unload();
}
```

**Todos los ficheros (modelo, imágenes, audio) se referencian por su nombre simple**, no por ruta. El modelo vive en una carpeta interna `models/` que gestiona el framework: `downloadModel` lo coloca ahí y `loadModel`/`getModelInfo` lo encuentran con el mismo nombre. No se aceptan rutas con `/`, `\`, `.` ni `..`.

---

## 2. Descargar un modelo (`downloadModel`)

Descarga **asíncrona** de un fichero de modelo desde HuggingFace. No bloquea la pantalla.

```js
ai.downloadModel({
    repository: "litert-community/gemma-4-E2B-it-litert-lm",  // requerido: <usuario>/<repo>
    file: "gemma-4-E2B-it.litertlm",                          // requerido: nombre de fichero
    revision: "main",                                          // opcional: rama/tag/commit (def. "main")
    token: "hf_xxx",                                           // opcional: solo para repos protegidos
    resume: true,                                              // opcional: reanudar descarga parcial (def. true)
    onProgress: function (percent) { },                       // porcentaje entero 0-100
    onComplete: function (file) { },                          // nombre del fichero descargado
    onError: function (msg) { }
});
```

- **`onProgress`** recibe un porcentaje entero y solo se llama cuando ese porcentaje cambia (no en cada bloque). Si el servidor no informa del tamaño total, no se emite progreso.
- **`onComplete`** recibe el **nombre del fichero**, listo para pasar tal cual a `loadModel({ path: file })`.
- **`resume: true`** reanuda una descarga cortada (útil para modelos de varios GB y redes inestables).
- **`token`**: algunos repos exigen aceptar una licencia y un token de acceso de HuggingFace. Sin él, el servidor responde con error (llega a `onError`). Los repos de la comunidad `litert-community` suelen ser abiertos y no necesitan token.

---

## 3. Comprobar el dispositivo (`canLoadModel`)

Indica si el dispositivo tiene recursos para cargar un modelo. Devuelve `true`/`false`.

```js
// Comprobación básica (arquitectura del dispositivo + memoria no crítica)
if (ai.canLoadModel()) { /* ... */ }

// Comprobación con el modelo concreto: además valida que el fichero existe
// y que hay RAM total suficiente (tamaño del fichero × factor)
if (ai.canLoadModel({ path: "gemma-4-E2B-it.litertlm", memoryFactor: 1.5 })) {
    ai.loadModel({ path: "gemma-4-E2B-it.litertlm" });
}
```

`memoryFactor` (por defecto `1.5`) se compara contra la RAM **total** del dispositivo, no la libre: si el dispositivo no tiene RAM total suficiente, no podrá cargar el modelo aunque ahora haya algo libre.

---

## 4. Inspeccionar el modelo (`getModelInfo`)

Lee los **parámetros de inferencia** del modelo **sin cargarlo** (es instantáneo, solo lee la cabecera del fichero). Acepta el nombre del fichero o un objeto `{ file }`.

```js
var info = ai.getModelInfo("gemma-4-E2B-it.litertlm");
// info = {
//   formatVersion: "1.5.0",
//   modelType: "gemma4",                // gemma4 | gemma3 | gemma3n | qwen3 | qwen2p5 | fastvlm | generic | unknown
//   fileSize: 2598123456,               // bytes
//   supportsVision: true,               // admite imágenes
//   supportsAudio: true,                // admite audio
//   supportsSpeculativeDecoding: true,  // trae acelerador MTP (ver §12)
//   maxNumTokens: 4096                  // OPCIONAL: solo si el modelo lo declara
// }
```

Útil para decidir antes de cargar. Por ejemplo, no intentar pasar imágenes a un modelo de solo texto:

```js
var info = ai.getModelInfo(file);
if (info.supportsVision) {
    ai.generate({ prompt: "¿Qué hay en la foto?", images: ["foto.jpg"] });
}
```

- Todos los campos están **siempre presentes** salvo `maxNumTokens`, que se omite cuando el modelo no lo declara. Muchos modelos (incluido Gemma 4 E2B) no fijan el tamaño de contexto en la cabecera; en ese caso lo controla el parámetro `maxTokens` de `loadModel`.
- `supportsSpeculativeDecoding` indica si tiene sentido activar `enableSpeculativeDecoding` al cargar (ver §12).

---

## 5. Cargar y descargar de memoria

### `loadModel`

```js
ai.loadModel({
    path,                       // requerido: nombre del fichero (en models/)
    backend: "GPU",             // "GPU" (def.) | "CPU"
    visionBackend: "GPU",       // requerido para usar imágenes; omitir en modelos de solo texto
    audioBackend: "GPU",        // requerido para usar audio; omitir en modelos de solo texto
    maxImages: 1,               // nº máximo de imágenes (junto con visionBackend en multimodales)
    maxTokens: 4096,            // tamaño de contexto (prompt + respuesta). Ver nota
    topK: 64,                   // recomendado Gemma 4
    topP: 0.95,                 // recomendado Gemma 4
    temperature: 1.0,           // recomendado Gemma 4 (creatividad; 0 = determinista)
    randomSeed: 0,
    enableSpeculativeDecoding: false, // activa MTP si el modelo lo soporta (ver §12)
    onModelLoaded: function () { },      // opcional: si se pasa, la carga es asíncrona (ver abajo)
    onModelLoadError: function (msg) { } // opcional: OBLIGATORIO junto con onModelLoaded
});
```

- **`backend`**: `"GPU"` por defecto (más rápido). Si un modelo no arranca o falla en GPU en cierto dispositivo, probar `"CPU"`.
- **`visionBackend` / `audioBackend`**: son los **activadores** de imagen/audio. Si no se indican, pasar `images`/`audio` a `generate`/`chat` da error. En modelos de solo texto, omitirlos.
- **`maxTokens`**: es el contexto **total** (entrada + salida). En móvil conviene mantenerlo moderado (p. ej. `4096`); valores muy altos consumen mucha memoria y pueden desestabilizar la carga.
- **`onModelLoaded` / `onModelLoadError` (carga asíncrona)**: dos callbacks opcionales que van **juntos** — o los dos o ninguno; pasar solo uno da error. Si se pasan, `loadModel` **no bloquea**: vuelve enseguida y carga el modelo en segundo plano, y al terminar llama a `onModelLoaded()` si fue bien o a `onModelLoadError(mensaje)` si falló. Es la forma recomendada de cargar el modelo **al arrancar** sin congelar la pantalla. Sin estos callbacks `loadModel` es **síncrono** (bloquea hasta cargar), por lo que en ese caso debe ejecutarse desde un nodo de acción/script en segundo plano.

```js
// Cargar al arrancar sin bloquear la interfaz (p. ej. si el modelo ya está descargado):
ai.loadModel({
    path: "gemma-4-E2B-it.litertlm",
    backend: "GPU",
    onModelLoaded: function () { ui.showToast("IA lista."); },
    onModelLoadError: function (msg) { ui.showToast("No se pudo cargar la IA: " + msg); }
});
```

### `unload` / `isLoaded`

```js
ai.isLoaded();   // true si hay un modelo cargado e inicializado
ai.unload();     // libera el modelo de memoria (libéralo cuando termines: ocupa mucha RAM)
```

Cargar un modelo es **costoso** (varios segundos y mucha RAM). Cárgalo una vez y reutilízalo; no lo cargues y descargues en cada interacción.

---

## 6. Generación sin historial (`generate`)

Genera una respuesta **de una sola vez**, sin recordar mensajes anteriores. Es **síncrona** (bloquea hasta terminar) y devuelve el texto como `String`.

```js
var texto = ai.generate({
    prompt: "Traduce al inglés: Buenos días",
    system: "Eres un traductor profesional.",   // opcional: instrucción de sistema
    images: ["recibo.jpg"],                      // opcional: array de imágenes
    audio: "nota.wav",                           // opcional: un audio
    tools: []                                    // opcional: herramientas (function calling) — ver §9
});
```

> **No la llames desde el hilo de interfaz** (p. ej. directamente en un `onclick` que bloquee la pantalla): lanza error si detecta que corre en el hilo de UI. Ejecútala desde un nodo de acción/script en segundo plano, o usa `chat` (asíncrono) si quieres no bloquear.

Para imágenes hace falta `visionBackend` en `loadModel`; para audio, `audioBackend`.

---

## 7. Chat multi-turno con streaming (`chat`)

Mantiene **historial** entre llamadas y entrega la respuesta **token a token** mediante callbacks (no bloquea la pantalla).

```js
ai.chat({
    prompt: "¿Y cuál es su capital?",
    system: "Responde de forma breve.",      // opcional
    images: ["mapa.png"],                     // opcional
    audio: "pregunta.wav",                    // opcional
    tools: [],                                // opcional: herramientas (function calling) — ver §9
    onToken: function (token) {               // se llama por cada fragmento de texto
        // acumular y refrescar la vista
    },
    onComplete: function (full) {             // texto completo al terminar
        ui.refresh();
    },
    onError: function (msg) {
        ui.msgBox(msg);
    }
});
```

- La conversación se conserva entre llamadas sucesivas a `chat`. Para empezar de cero, usar `clearChat()`.
- Si cambias el `system` —o el conjunto de herramientas (`tools`)— entre llamadas, la conversación se reinicia automáticamente.
- Los callbacks se ejecutan preservando el contexto del objeto activo (`self`), igual que cualquier callback asíncrono del framework — pero si vas a usar `self` dentro, guárdalo en una variable antes de llamar a `chat`.

---

## 8. Cancelar y reiniciar

```js
ai.cancel();      // cancela la generación de chat en curso (si la hay)
ai.clearChat();   // borra el historial de la conversación y la instrucción de sistema
```

---

## 9. Herramientas / function calling (`tools`)

Permite que el modelo **invoque funciones JavaScript** cuando lo considere necesario (function calling). Cada herramienta se describe en un fichero JSON (estilo OpenAI) y se asocia a una función JS que recibe los parámetros. Las herramientas se pasan en el parámetro `tools` de `chat` o `generate` — un array de objetos `{ jsonDescriptorPath, callback }`:

```js
// "tools/clima.json" describe la herramienta (nombre, descripción, parámetros)
ai.chat({
    prompt: "¿Qué tiempo hace en Madrid?",
    tools: [
        {
            jsonDescriptorPath: "tools/clima.json",
            callback: function (params) {
                var ciudad = params.ciudad;
                // ... obtener el dato ...
                return JSON.stringify({ temperatura: 21, ciudad: ciudad });
            }
        }
    ],
    onComplete: function (full) { /* ... */ }
});
```

La función recibe los parámetros como un mapa `clave → valor` y debe devolver una cadena (normalmente JSON). Las herramientas funcionan tanto en `chat` como en `generate`. En `chat`, si cambias el conjunto de herramientas entre llamadas, la conversación se reinicia automáticamente.

---

## 10. Skills automáticas (`loadSkills`)

Las **skills** son comportamientos especializados que el modelo **detecta y aplica automáticamente** según el mensaje del usuario. No son function calling: son instrucciones de comportamiento que se inyectan en el contexto. Cada skill es un fichero Markdown.

```js
ai.loadSkills("skills/");        // carga todos los .md de la carpeta (cada fichero = una skill)
ai.removeSkill("traductor");     // elimina una skill por nombre
ai.clearSkills();                // elimina todas las skills
```

**Formato del fichero `.md` — encabezado obligatorio:**

```
---
name: traductor
description: Traduce texto entre idiomas
---
Instrucciones de comportamiento de la skill...
```

- `name` y `description` son obligatorios; el cuerpo (las instrucciones) no puede quedar vacío. Los ficheros que no cumplan el formato se ignoran.
- Con **2 o más skills**, el modelo elige automáticamente la más adecuada a cada mensaje antes de responder (añade algo de latencia). Con **una sola**, se aplica siempre. Con **ninguna**, comportamiento normal.

---

## 11. Multimedia: formatos soportados

> **No hay soporte de vídeo.** Las entradas multimedia son **imagen** y **audio**. Si necesitas analizar un vídeo, extrae fotogramas como imágenes.

### Imagen

| Formato | Soporte |
|---|---|
| JPEG / JPG | ✅ |
| PNG | ✅ |
| BMP | ✅ |
| GIF | ✅ (solo primer fotograma) |
| TGA, HDR, PSD, PNM/PPM/PGM | ✅ |
| WebP | ❌ |
| HEIC / AVIF | ❌ |

**Recomendado:** JPEG para fotos, PNG para capturas. Atención: **HEIC** es el formato por defecto de muchas cámaras de móvil modernas y **no se admite** — convertir a JPEG/PNG antes.

### Audio

| Formato | Soporte |
|---|---|
| WAV | ✅ |
| MP3 | ✅ |
| FLAC | ✅ |
| Ogg / Opus | ❌ |
| AAC / M4A | ❌ |

**Recomendado:** WAV mono 16 kHz 16-bit. Atención: **AAC/M4A** (grabaciones de voz típicas del móvil) **no se admiten**.

> **Para grabar ese WAV desde el micrófono** usa `ui.startAudioRecord({ outputFormat: "wav", timeout: 30, onComplete: ... })`: produce justo WAV PCM 16 bits / 16 kHz / mono y respeta el máximo de 30 s de audio del modelo. **Ojo:** su formato por defecto es `mp4` (AAC) y **no sirve** para la IA; hay que pedir `outputFormat: "wav"` explícitamente. Pasa la ruta del `onComplete` directamente como `audio`. Ver `topics/03b-js-ui.md` §3.10.

### Validar la extensión antes de enviar

```js
function getMediaType(fileName) {
    if (!fileName) { return null; }
    var nDot = fileName.lastIndexOf(".");
    if (nDot < 0) { return null; }
    switch (fileName.substring(nDot + 1).toLowerCase()) {
        case "jpg": case "jpeg": case "png": case "bmp":
        case "gif": case "tga": case "hdr": case "psd":
        case "pnm": case "ppm": case "pgm":
            return "image";
        case "wav": case "mp3": case "flac":
            return "audio";
        default:
            return null;   // webp, heic, m4a, aac, vídeo, etc.
    }
}
```

---

## 12. Parámetros recomendados (Gemma 4)

Google publica una configuración de muestreo estándar para Gemma 4, que son **los valores por defecto** del objeto `ai`:

| Parámetro | Gemma 4 (por defecto) |
|---|---|
| `temperature` | `1.0` |
| `topP` | `0.95` |
| `topK` | `64` |

**MTP (Multi-Token Prediction / decodificación especulativa):** algunos modelos Gemma 4 traen un "acelerador" que puede **duplicar la velocidad** de generación sin perder calidad. Se activa con `enableSpeculativeDecoding: true` en `loadModel`, y solo tiene efecto si:

- El modelo lo soporta — compruébalo con `getModelInfo(file).supportsSpeculativeDecoding`.
- Se usa `backend: "GPU"` (es donde está validado).

```js
var info = ai.getModelInfo(file);
ai.loadModel({
    path: file,
    backend: "GPU",
    enableSpeculativeDecoding: info.supportsSpeculativeDecoding
});
```

---

## 13. Buenas prácticas y problemas comunes

| Situación | Recomendación |
|---|---|
| `generate` lanza error de "hilo de UI" | No la llames en un `onclick` que bloquee; usa un nodo de acción en segundo plano o `chat` (asíncrono). |
| El modelo tarda mucho o no arranca en GPU | Probar `backend: "CPU"`. La primera carga siempre es lenta (compila en el dispositivo). |
| Falta de memoria al cargar | Bajar `maxTokens`; comprobar antes con `canLoadModel({ path, memoryFactor })`; llamar a `unload()` cuando termines. |
| Pasar imagen/audio da error | Falta `visionBackend`/`audioBackend` en `loadModel`, o el modelo no es multimodal (`getModelInfo`). |
| Imagen/audio no reconocidos | Formato no soportado (HEIC, M4A, WebP, vídeo). Convertir a JPEG/PNG o WAV. |
| Recargas el mismo modelo una y otra vez | Cárgalo una vez y reutilízalo; cargar es costoso en tiempo y RAM. |
| `maxNumTokens` no aparece en `getModelInfo` | Normal: el modelo no lo declara. El contexto lo fija tú con `maxTokens` en `loadModel`. |

