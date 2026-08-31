---
name: xone-development
description: "Desarrollo XOne: XML .xne, JS del runtime, CSS, datos, dispositivo, fundamentos. UI/.xne: colecciones, props/tipos, groups, frames, contents, asfilter, combos mapcol/mapfld, mapas, kanban, chips, Lottie en IMG, layouts, inherits, include-layout, eventos XML, permisos. JS y functions.js: self, selfDataColl, ui, appData, err, user, getControl, métodos de controles, singletons, creables, lock/unlock, startBrowse/endBrowse, objeto ai. CSS: default.css, clases, selectores coll/prop:TYPE/group/frame, unidades p/%, colores #AARRGGBB, extends/@extend, :root/var(), calc(), @import, temas light/dark, animaciones. Datos: SQL ##PREF##, SqlManager, macros, $http TLS/pinning/mTLS, futures, OAuth2, crypto. Dispositivo: GPS, cámara, foto/vídeo, QR/barcode, scanDocument, OCR recognizeText, firma DR, biometría, Bluetooth, impresión, NFC, DNI electrónico. Fundamentos: app.xml, app.ini, mappings.xne, bd/icons/files/fonts, macros, códigos de error, Splash→Login→EntradaApp→Menu, convenciones de nombres."
---

# XOne — Desarrollo (XML, JavaScript, CSS, datos y dispositivo)
Estas son las reglas que aplican a cualquier trabajo sobre un proyecto XOne, sea XML, JavaScript o CSS. **No afirmes nada que no esté en las referencias de esta skill o de las especializadas.** Si una API, atributo o comportamiento no aparece, dilo y pide el dato; no lo deduzcas por analogía con la web ni con otros frameworks.

## Referencias

**Este `SKILL.md` es la referencia CORTA y lleva solo las reglas duras.** Una lectura por
omisión trae **100 líneas** (`DEFAULT_READ_LIMIT` de deepagents) y este fichero tenía 395, así
que el índice y los anti-patrones no se leían salvo que el modelo pidiera `limit=1000` — lo
hacía la mitad de las veces (dorado con control, 2026-08-24). Ahora todo lo consultable vive
al lado, y cada fichero cabe entero:

| Qué buscas | Dónde |
|---|---|
| **El índice COMPLETO** de las 55 referencias, por familia | [references/indice-completo.md](references/indice-completo.md) |
| **Tipos de `prop` válidos** (la tabla) | [references/tipos-de-prop.md](references/tipos-de-prop.md) |
| **Anti-patrones**: lo que NO hay que hacer, con el porqué | [references/anti-patrones.md](references/anti-patrones.md) |
| Resumen de la capa XML y de la capa CSS | [references/resumen-xml-y-css.md](references/resumen-xml-y-css.md) |
| Resumen de JavaScript, datos e integración y dispositivo | [references/resumen-js-datos-dispositivo.md](references/resumen-js-datos-dispositivo.md) |

Las cinco familias del detalle están en `references/`: `fundamentos/`, `xml-ui/`,
`javascript/`, `css/`, `datos/` y `dispositivo/`.

## Siempre

1. **Consulta la referencia antes de responder.** Cada área tiene su fichero; están indexados abajo y en las skills especializadas.
2. **La fuente es el `.xne`.** Los ficheros `.xml` de colecciones y pantallas son artefactos generados automáticamente por XOneStudio a partir de los `.xne`: no se leen, no se editan, no se consultan. La única excepción es `app.xml`, que sí es fuente. Si conviven `.xne` y `.xml`, trabaja solo sobre los `.xne`.
3. **`progid` es opcional.** Sin él, la coll es un objeto de datos genérico (equivalente a `ASData.CASBasicDataObj`). Solo **Empresas** (`ASGestion.CASEmpresa`) y **Usuarios** (`ASGestion.CASUser`) requieren el suyo para activar su lógica de negocio. No inventes progids. **Conflicto conocido sin resolver:** `xone-simulator` lo marca como error (`COLL_MISSING_PROGID`) pese a ser opcional según lo anterior. No resuelvas la discrepancia por tu cuenta: repórtala y deja la decisión al desarrollador.
4. **Encoding coherente en los `.xne`.** El motor respeta el `encoding` declarado en el prólogo y asume UTF-8 si falta. UTF-8 e iso-8859-15 son válidos; lo que corrompe tildes y eñes es declarar uno y guardar en otro.
5. **`ID` y `ROWID` los gestiona la plataforma.** No hace falta declararlos como `<prop>` (es válido pero redundante). En el `sql=` de la coll, `ID` sí se rescata en el SELECT; `ROWID` no es necesario.
6. **Inicializa con el evento correcto:** `<before-edit>` al abrir para editar, `<create>` la primera vez. `<load>` se dispara **por cada DataObject** al cargar desde la BD (startBrowse, loadAll, `<contents>`) y no se recomienda por rendimiento.
7. **Los nombres son únicos y case-sensitive.** Ver la sección de unicidad más abajo.

## Nunca

1. **No inventes** atributos XML, funciones JavaScript ni propiedades CSS que no estén en las referencias. XOne ignora silenciosamente los atributos desconocidos, así que un invento no da error: da un bug silencioso.
2. **No uses APIs del DOM.** No existen: `document`, `window`, `localStorage`, `sessionStorage`, `XMLHttpRequest`, `navigator`, `history`.
3. **No uses VBScript.** Está descontinuado en XOne aunque alguna referencia histórica lo mencione. La única opción válida es `<script language="javascript">`; si encuentras un ejemplo en VBScript, tradúcelo antes de proponerlo.
4. **No mezcles patrones de React, Angular, Vue** ni de ningún framework web.
5. **No repitas nombres de nodos dentro de la misma colección.**
6. **No uses `<load>`** para inicializar una pantalla: produce bugs silenciosos.

## Sintaxis JavaScript que soporta el motor

**Sí:** `let`, `const`, arrow functions, destructuring, `class` (con `extends`, `super`, `static`, getters/setters, computed keys, field declarations y generator methods con `*`), `Promise` (ES2024 completo: `all`, `allSettled`, `race`, `any`, `withResolvers`, `.then`, `.catch`, `.finally`), generadores con `yield` (runtime estilo SpiderMonkey legacy: `.next()` devuelve el valor directo y `StopIteration`; no `for...of` sobre generadores), `for...of` sobre arrays y strings, `Symbol`, typed arrays.

**No, a nivel de sintaxis:** template literals `` `${x}` ``, `async`/`await`, spread/rest, parámetros por defecto, optional chaining `?.`, nullish coalescing `??`, computed keys en object literals (sí en cuerpo de clase), campos privados `#name`, bloques `static`.

**Sí existen con implementación custom de XOne** (semántica compatible con WHATWG): `fetch(input, init?)` con limitaciones (no admite `Request` como primer argumento, ni body `FormData`/`Blob`/`ReadableStream`, ni cancelación real en vuelo), `setTimeout`/`clearTimeout`/`setInterval`/`clearInterval`/`queueMicrotask`, `URL`/`URLSearchParams`, `Headers`, `AbortController`/`AbortSignal`, `Response`, `EventTarget`, `TextEncoder`/`TextDecoder`, `console` completo (`log`, `info`, `debug`, `warn`, `error`, `trace`, `assert`, `group`, `time`, `table`… con formato `%s`/`%d`/`%j`), `performance.now()`, `atob`/`btoa`, `structuredClone`, `DOMParser`/`XMLSerializer`, `globalThis`.

Aun existiendo, lo idiomático en XOne es `$http` en vez de `fetch`, y `ui.executeActionAfterDelay` en vez de `setTimeout`.

## Unicidad y nombres

- El ámbito de unicidad es la **`<coll>` entera**, no el `<group>` ni el `<frame>`: no puede haber dos `<prop>`, dos `<group>`, dos `<frame>` ni dos eventos con el mismo `name` en ninguna parte de la misma coll, aunque estén en grupos distintos. El `name` se publica a nivel de coll (los `collprops`) y se volvería ambiguo.
- Dos `<coll>` distintas **sí** pueden tener contenido idéntico, siempre que su propio `name` sea distinto. Dos colls con el mismo `name` en el proyecto no son válidas.
- El atributo `name` es **case-sensitive**, y eso aplica a todas las referencias cruzadas: `self.MiNombre`, `mapcol`, `linkedto`, `inherits`, `<field name="...">`, `getControl("...")`, `ui.openEditView("...")`, `appData.getCollection("...")`.
- En cada `<group>`, `id` es obligatorio y único dentro de la coll. Convención habitual: `1`, `2`, `3`… para grupos normales, `999` para HEADER fijo y `0` para FOOTER fijo.
- Prefijo `MAP_`: significa que el prop **no es columna de la tabla de `objname`**, así que el framework lo excluye de INSERT y UPDATE. Lo llevan los alias de JOIN (`c.NOMBRE AS MAP_NOMBRECLIENTE`), la descripción visible de un combo con `linkedto`, y los props puramente visuales (labels, botones, totales, estados de UI). **El fallo es simétrico**: ponérselo a una columna real pierde el dato al guardar; omitirlo en un alias o en la descripción de un combo da error SQL al actualizar una columna inexistente. Detalle en [convenciones](references/fundamentos/navegacion-convenciones-y-primer-proyecto.md).

## Visibilidad

Bitmask de 4 bits: `1` edición · `2` lista · `4` content · `8` combo. Cualquier combinación es válida.

| Valor | Contextos |
|---|---|
| `0` | Ninguno: campo interno, solo para lógica |
| `1` | Solo formulario de edición |
| `2` | Solo lista |
| `3` | Edición + lista |
| `4` | Solo content (lista embebida) |
| `7` | Edición + lista + content — **el más habitual** |
| `8` | Solo combo |
| `15` | Todos |

`visible` es **estático**: no se cambia en runtime, ni por script ni por eventos. Para visibilidad condicional se usa `disablevisible="CAMPO=valor"`, que sí es dinámico.

## Ciclo de vida y eventos

| Necesito | Evento |
|---|---|
| Inicializar la primera vez | `<create>` |
| Inicializar al abrir para editar | `<before-edit>` |
| Ejecutar tras entrar en edición | `<after-edit>` |
| Reaccionar a cada ítem al cargar una colección (no recomendado) | `<load>` |
| Cambio de campo | `<onchange>` + `<field name="CAMPO">` |
| Botón atrás | `<onback>` |

No existen `<unload>`, `<ondelete>`, `<beforedelete>` ni `<afterdelete>`. Para borrado hay `<delete>` con hijos `<rule>`, que es un bloque de reglas, no un evento antes/después. Solo puede haber un `<before-edit>` por coll.

- **No uses `<load>` para inicializar pantallas**: se dispara por cada DataObject cargado. `xone-simulator` lo marca como `ANTIPATTERN_LOAD_EVENT`.
- Solo un `<before-edit>` por coll (`ANTIPATTERN_MULTIPLE_BEFORE_EDIT`).
- En un botón, `onclick` **o** `method="ExecuteNode(...)"`, nunca ambos. Para lógica compleja, `ExecuteNode` y un nodo aparte.
- `onchange="refresh"` o `onchange="refresh(MAP_CAMPO)"`; `refresh255` es notación legacy de PDA.

El **catálogo de eventos** (cuándo dispara cada uno, con qué parámetros) vive con el XML, porque los eventos se declaran en el XML: [eventos de ciclo de vida e interacción](references/xml-ui/eventos-ciclo-de-vida-e-interaccion.md) (`create`, `before-edit`, `after-edit`, `load`, `onclick`, `onchange`, `selecteditem`, `onlongpressitem`, `onback`) y [eventos de sistema, login y personalizados](references/xml-ui/eventos-sistema-login-y-personalizados.md) (drawer, bottom sheet, login, `onpushreceived`, `maintenance`, `sys-message` y sus códigos, ciclo de aplicación, `ExecuteNode` y acciones).

## JavaScript embebido en `.xne`

Para JS no trivial, la forma preferida es declarar la función en un `.js` externo (`functions.js` u otro incluido) y llamarla desde el XML con `miFuncion();`, escribiendo el JS normal, sin entidades ni CDATA. Para snippets cortos inline: dentro de un nodo `<script>` valen tanto entidades XML (`&lt;`, `&gt;`, `&amp;`) como `<![CDATA[…]]>`; dentro de un atributo (`onclick=`, `disablevisible=`) **solo entidades**, porque CDATA no es válido en atributos XML.

