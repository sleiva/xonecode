# XOne JavaScript — Motor, contexto de ejecución y escape XML

> Fuente: `xone/v2/xone-help-docs/topics/03a-js-self.md` §1. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §1 motor JS embebido, objetos globales disponibles, cómo se ejecuta el JS desde eventos XML, diferencias con JS web, archivos JS del proyecto, alcance y persistencia de variables, buenas prácticas y escape XML/CDATA dentro de .xne

---

## 1. Introduccion al JavaScript de XOne

### 1.1 Motor JS Embebido

El JavaScript de XOne **NO se ejecuta en un navegador web ni en Node.js**. Se ejecuta dentro de un motor JavaScript nativo embebido en la aplicación móvil (Rhino/V8 según la plataforma). Esto implica limitaciones fundamentales que todo desarrollador debe conocer.

Los scripts se colocan dentro de nodos `<script>` en archivos `.xne`, vinculados a eventos del ciclo de vida de la pantalla:

```xml
<coll name="MiPantalla" title="Mi Pantalla" class="xnCollBase">

    <!-- Se ejecuta UNA sola vez al crear el objeto (primera apertura) -->
    <create>
        <action name="runscript">
            <script language="javascript">
                inicializar();
            </script>
        </action>
    </create>

    <!-- Al abrir el objeto para edicion — evento principal para inicializar la pantalla -->
    <before-edit>
        <action name="runscript">
            <script language="javascript">
                cargarDatos();
            </script>
        </action>
    </before-edit>

    <!-- Al pulsar el botón atrás -->
    <onback>
        <action name="runscript">
            <script language="javascript">
                manejarAtras();
            </script>
        </action>
    </onback>

</coll>
```

> **Crítico**: `<load>` NO se ejecuta al mostrar la pantalla — se dispara **por cada DataObject** al cargarse desde la BD: tanto al recorrer la coleccion (`startBrowse()`/`loadAll()`) como al hidratar items de un `<contents>` o cargas individuales. **NO se recomienda usarlo** porque el rendimiento puede verse seriamente afectado (se ejecuta una vez por item cargado). Para inicializar una pantalla usar `<before-edit>` (al abrir para editar) o `<create>` (primera apertura).

> **Referencia cruzada:** Para la estructura completa de eventos en nodos XML, consultar el tópico 02 - Estructura XML. Para los estilos CSS aplicables a controles manipulados desde JS, ver el tópico 04 - Estilos CSS.

### 1.2 Objetos Globales Disponibles

XOne expone los siguientes objetos globales accesibles desde cualquier script:

| Objeto | Descripción |
|--------|-------------|
| `ui` | Interfaz de usuario: dialogos, toasts, navegación, GPS, camara |
| `appData` | Datos de la aplicación: colecciones, autenticación, macros, rutas |
| `self` | Objeto de datos actual (DataObject) en el contexto del script |
| `crypto` | Funciones criptograficas: hashing, cifrado AES, firma digital, encoding |
| `$http` | Cliente HTTP asíncrono: GET, POST, PUT, DELETE, PATCH, download |
| `console` | Logging WHATWG completo: `console.{log,info,debug,warn,error,trace,assert,group,groupCollapsed,groupEnd,time,timeLog,timeEnd,count,countReset,dir,dirxml,clear,table}` con formato `%s/%d/%j/...` |
| `biometricsManager` | Autenticación biometrica (huella, face) y firma biometrica |
| `fingerprintManager` | Huella dactilar (API legacy, preferir `biometricsManager`) |
| `bluetoothSerial` | Comunicación por puerto serie Bluetooth |
| `replica` | Control de sincronización/replica con servidor |
| `systemSettings` | Singleton global: brillo, permisos, memoria, MDM, batería, rutas, Intune |
| `deviceInfo` | Singleton global: batería, red móvil, trafico de bytes |

### 1.3 Como se Ejecuta el JS: Eventos XML a Acciones a Script

El flujo de ejecución en XOne sigue este patron:

```
1. Usuario interactua con la UI (pulsa boton, cambia campo, etc.)
         |
2. El framework detecta el evento asociado al nodo XML
         |
3. Se ejecuta el bloque <script> vinculado al evento
         |
4. El script accede a objetos globales (self, ui, appData)
         |
5. Las acciones del script modifican datos y/o la interfaz
```

**Eventos disponibles en nodos XML:**

| Evento | Momento de Ejecución | Ubicación |
|--------|---------------------|-----------|
| `<create>` | Una sola vez al crear el objeto (primera apertura) | Dentro de `<coll>` |
| `<before-edit>` | Al abrir un objeto para edición — **el más usado para inicializar la pantalla** | Dentro de `<coll>` |
| `<after-edit>` | Después de entrar en modo edición, con la UI ya montada | Dentro de `<coll>` |
| `<load>` | Se dispara **por cada DataObject** al cargarse desde la BD (startBrowse/loadAll/`<contents>`/cargas individuales). **NO es evento de pantalla** y **NO recomendado** por impacto en rendimiento | Dentro de `<coll>` |
| `<onchange>` | Cuando cambia el valor de una propiedad | Dentro de `<coll>`, nodo `<field>` |
| `<selecteditem>` | Cuando se selecciona un item en una lista | Dentro de `<coll>` |
| `<onlongpressitem>` | Pulsacion larga en un item de lista | Dentro de `<coll>` |
| `<onback>` | Cuando el usuario pulsa el botón atrás | Dentro de `<coll>` |
| `<miNodo>` | Nodo custom invocado con `ExecuteNode(miNodo())` o `method="executenode(miNodo)"` | Dentro de `<coll>` |

### 1.4 Diferencias con JS Web

**APIs que NO están disponibles en XOne:**

| API Web | Alternativa XOne |
|---------|------------------|
| `document`, `window` (DOM) | `ui.getView(self)` para acceder a controles |
| `localStorage` / `sessionStorage` | `appData.getGlobalMacro()` / `appData.setGlobalMacro()` |
| `XMLHttpRequest` | `$http.get()`, `$http.post()`, etc. (también existe `fetch` custom). |
| `navigator.geolocation` | `ui.startGps()` / `ui.checkGpsStatus()` |
| `alert()` / `confirm()` / `prompt()` | `ui.msgBox()` / `ui.showToast()` |
| `require()` / `import` | No hay sistema de módulos; todo va en `functions.js` |
| `async` / `await` | Callbacks o `Promise` (sí soportado vía implementación custom). |

**Sintaxis ES6+ NO soportada:**

| Sintaxis | Estado | Alternativa |
|----------|--------|-------------|
| Template literals `` `${var}` `` | Parse error (*illegal character*) sobre el backtick | Concatenación con `+` |
| `async` / `await` | Parse error (reservadas) | Callbacks o `Promise` |
| Spread/rest `...args`, default params `function f(x=1)` | Parse error | `arguments` / chequeo `=== undefined` |
| Computed keys en object literals `{[k]: v}` | Parse error (sí en class body) | `var o = {}; o[k] = v;` |
| Optional chaining `?.` / nullish coalescing `??` | Parse error | Chequeos manuales |
| Private fields `#name` en class | Parse error (requiere runtime) | Convención `_name` |
| Static blocks `static { ... }` en class | Parse error | Sentencias `ClassName.x = ...;` tras la clase |

**SÍ funciona:** `let`, `const`, arrow functions `() => {}`, destructuring (`var {a, b} = o`), `for...of` sobre arrays/strings, generadores con `yield` (runtime SpiderMonkey legacy — usar `try { while (true) v = iter.next(); } catch (e) {}`), Symbol, typed arrays, **`class` ES6+ con `extends`/`super`/`static`/getters/setters/computed keys/field declarations/generator methods (`*method()`)**, **`Promise` ES2024 completo** (`.then`/`.catch`/`.finally`/`Promise.all`/`allSettled`/`race`/`any`/`withResolvers`), `fetch`, `setTimeout`/`setInterval`, `URL`, `AbortController`, `TextEncoder`/`TextDecoder`, `console.{log,info,warn,error,debug,trace,...}`, `performance.now()`, métodos modernos de `String` (`padStart`, `replaceAll`, `at`, `matchAll`...) y de `Array` (`map`, `filter`, `reduce`, `find`...), `JSON`. Detalle completo en 01-xone-fundamentals.md §6.7.

### 1.5 Archivos JavaScript en el Proyecto

```
MiProyecto/
  functions.js          <- Funciones globales (siempre presente, carga automatica)
  scripts/              <- Scripts adicionales organizados (opcional)
    ubicacion.js
    viajes.js
    mensajeria.js
```

El archivo `functions.js` es el punto de entrada global. Se carga automáticamente al iniciar la aplicación y sus funciones están disponibles en todos los scripts `.xne` del proyecto. Para proyectos grandes, se recomienda organizar la lógica en archivos adicionales dentro de `scripts/` y cargarlos con `appData.loadIncludeFile()`.

### 1.6 Alcance de Variables

```javascript
// Variables globales: accesibles desde cualquier script del proyecto
// Se definen en functions.js
var MI_CONSTANTE = "valor";
var ESTADOS = { ACTIVO: 1, INACTIVO: 0 };

// Variables locales: solo dentro de la funcion
function miFuncion() {
    let variableLocal = "solo existe aquí";
}

// IMPORTANTE: 'self' puede cambiar de contexto en callbacks asincronos
// Guardar referencia ANTES de cualquier operación asincrona
function operacionAsincrona() {
    let contexto = self;  // Guardar referencia
    $http.get(url, request,
        function(sData) {
            // Aquí 'self' puede NO ser el mismo objeto
            // Usar 'contexto' en su lugar
            contexto.MAP_RESULTADO = sData;
        },
        function(nError, sDesc) {
            ui.showToast("Error: " + sDesc);
        }
    );
}
```

### 1.7 Ambitos de ejecución y persistencia de variables

Entender en que **ambito** se ejecuta cada script es fundamental para usar correctamente `This` / `self`, `ThisDataColl` y las variables globales.

**Ambitos posibles:**

| Ambito | Cuando | `This` / `self` | `ThisDataColl` |
| --- | --- | --- | --- |
| **Objeto** | Acción disparada desde un objeto (p.ej. `<create>`, `<onchange>` de un prop) | El objeto en cuestion | `Nothing` / `null` |
| **Coleccion** | Acción en nodo `<coll-action>` (p.ej. `<onlogon>`) | `Nothing` / `null` | La coleccion que dispara el script |
| **Local** | Dentro de una `function()` | — | — |

**Reglas de visibilidad:**

- `appData` es siempre visible desde cualquier ambito.
- `self` / `This` y `ThisDataColl` son visibles durante la ejecución del script y de todas las funciones que se llamen desde el. **No** son visibles dentro de acciones anidadas (p.ej. un `Save` que dispara otro script tiene su propio ambito).
- `user` es visible cuando hay usuario logueado.
- Una variable declarada en el bloque principal del script es visible para todas las funciones llamadas desde ese mismo script, pero **no** para acciones anidadas.

**Intercambio de datos entre scripts anidados:** como las variables locales no sobreviven al anidamiento, hay que usar mecanismos persistentes:

- Propiedades del objeto (`self.MAP_FLAG = 1`)
- Variables de la coleccion (`coll.setVariable(...)`)
- Colecciones globales (`appData.getCollection("...")`)
- Macros globales (`appData.setGlobalMacro("##KEY##", valor)` / `appData.getGlobalMacro("##KEY##")`)
- Objeto `user` (persiste durante la sesión)

### 1.8 Buenas prácticas al programar en XOne

Patrones que evitan bugs sutiles y problemas de rendimiento:

**1. No uses `LoadAll()` sin motivo.** Cargar todos los objetos en memoria es caro. Si solo necesitas recorrer una coleccion, usa `startBrowse()` / `endBrowse()`. Para contar, `startBrowse(true)`.

**2. No filtres colecciones globales sin restaurar.** Si haces `coll.setFilter(...)` sobre una coleccion global y no la restauras, afectara a todas las vistas que usen esa coleccion.

```javascript
// MAL: filtra la coleccion global y afecta la UI
let coll = appData.getCollection("Clientes");
coll.setFilter("CODIGO=1");
coll.startBrowse();
// ... al salir, la lista de clientes solo muestra el cliente 1

// BIEN: trabajar sobre una copia
let coll = appData.getCollection("Clientes").createClone();
coll.setFilter("CODIGO=1");
// ... usar coll ...
coll = null;  // liberar
```

**3. Anula las referencias en orden inverso.** Si creas una coleccion y sacas objetos de ella, anula primero los objetos y luego la coleccion. Nunca al reves (la coleccion puede destruir los objetos antes).

**4. Guarda una marca para evitar reentradas.** Si un `Save` puede dispararse desde dentro de un `<onchange>` que a su vez puede llamarse otra vez al modificar el mismo campo, usa una propiedad centinela:

```xml
<onchange field="MAP_IMPORTE">
    <action name="runscript">
        <script language="javascript">
            if (self.MAP_SAVING == 0) {
                self.MAP_SAVING = 1;
                // ... calcular cosas ...
                self.save();        // dispara este mismo evento
                self.MAP_SAVING = 0;
            }
        </script>
    </action>
</onchange>
```

**5. No modifiques `CurrentItem` con cursores abiertos.** Algunas bases de datos no permiten modificar una tabla con cursores activos. Si tienes que modificar muchos objetos, mejor hazlo con `executeSql` o carga los IDs, cierra el cursor, y modifica uno a uno.

**6. En callbacks asíncronos, captura `self` antes.** Ver sección 1.6.

---

### 1.9 JavaScript dentro de XNE: escape XML o CDATA

Cuando el JavaScript va embebido dentro de un fichero `.xne` (en `<script language="javascript">` o en atributos como `onclick`, `disablevisible`, `value`, etc.), el bloque JS forma parte del XML y **debe respetar las reglas de XML**.

**Regla preferida — JS no trivial debe vivir fuera del `.xne`:** declarar una función en `functions.js` (o un fichero `.js` incluido) y llamarla desde el XML con `miFuncion();`. Así el JS se escribe normal (sin entidades, sin CDATA) y el XML solo invoca. Es lo más mantenible, lo más legible y evita por completo el problema del escape.

Cuando aun así necesitas escribir JS inline (snippets cortos), hay dos formas válidas de evitar que los caracteres especiales rompan el parseo XML:

1. **Entidades XML** dentro del JavaScript — funciona en cualquier sitio (nodo y atributo).
2. **`<![CDATA[...]]>` envolviendo el bloque** — funciona solo dentro de nodos `<script>`. NO es válido dentro de atributos XML (`onclick="..."`, `disablevisible="..."`).

Las dos son equivalentes en cuanto al resultado: el motor JS recibe el mismo código.

**Tabla de entidades:**

| Carácter JS | Entidad XML | Cuando aparece |
|-------------|-------------|----------------|
| `&`         | `&amp;`     | Operador `&&` se escribe `&amp;&amp;` |
| `<`         | `&lt;`      | Comparación `<` se escribe `&lt;` |
| `>`         | `&gt;`      | Comparación `>` se escribe `&gt;` |
| `"`         | `&quot;`    | Solo si el JS está dentro de un atributo XML con delimitador `"` |
| `'`         | `&apos;`    | Solo si el JS está dentro de un atributo XML con delimitador `'` |

**Ejemplo comparativo — el mismo JS escrito de las dos formas:**

(fence sin lenguaje para que las entidades se rendericen literales y se vean como tendrías que teclearlas en el `.xne`)

```
<!-- OPCIÓN A: entidades XML dentro del JS (válido en nodo o atributo) -->
<before-edit>
    <action name="runscript">
        <script language="javascript">
            if (a &gt; 0 &amp;&amp; b &lt; 10) {
                self.MAP_RES = a + b;
            }
        </script>
    </action>
</before-edit>

<!-- OPCIÓN B: envolver en CDATA (solo válido en nodo <script>) -->
<before-edit>
    <action name="runscript">
        <script language="javascript"><![CDATA[
            if (a > 0 && b < 10) {
                self.MAP_RES = a + b;
            }
        ]]></script>
    </action>
</before-edit>
```

**JS dentro de un atributo XML** (CDATA no aplica — solo entidades):

```
<!-- Atributo onclick (delimitador "): comillas internas con &quot; o usa '.
     onclick es un script JS inline en modo estricto: cada sentencia debe acabar en ';'. -->
<prop name="MAP_BTN" type="B" title="Buscar"
      onclick="if (self.MAP_TEXTO &amp;&amp; self.MAP_TEXTO.length &gt; 0) { hacerBusqueda(self.MAP_TEXTO); };" />

<!-- disablevisible con comparaciones también usa entidades -->
<prop name="MAP_AVISO" type="L"
      disablevisible="MAP_TOTAL &gt;= 100 &amp;&amp; MAP_ACTIVO=1" />
```

**Regla de oro:**

| Donde vive el JS | Cómo se escribe |
|-------------------|-----------------|
| Fichero `.js` separado (`functions.js`, `scripts/*.js`) — **forma preferida para JS no trivial** | JavaScript puro, sin entidades, sin CDATA. |
| Atributo XML (`onclick=`/`disablevisible=`/…) | Con entidades XML (`&amp;`, `&lt;`, `&gt;`, etc.). CDATA no es válido dentro de atributos. |
| Nodo `<script>` dentro de un `.xne` (snippets cortos) | Entidades XML o `<![CDATA[…]]>`. Ambas formas funcionan. |

