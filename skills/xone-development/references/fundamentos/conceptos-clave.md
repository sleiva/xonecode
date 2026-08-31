# XOne — Conceptos clave

> Fuente: `xone/v2/xone-help-docs/topics/01-xone-fundamentals.md` §6. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §6 colecciones, DataObject, props, prefijo ##PREF##, macros del sistema, códigos de error y sintaxis JavaScript soportada por el motor

---

## 6. Conceptos Clave

### 6.1 Colecciones

Una **coleccion** en XOne es el concepto más fundamental. Combina tres roles que en desarrollo web suelen estar separados:

1. **Tabla de base de datos**: Define la estructura de datos (campos, tipos)
2. **Pantalla/Vista**: Define como se presenta la información al usuario
3. **Formulario**: Define como el usuario interactua con los datos

#### Tipos de Colecciones

| Tipo | Tiene tabla en BD? | Uso típico | Ejemplo |
|------|-------------------|------------|---------|
| **Con datos** (SQL) | Si | Almacenar registros persistentes | `Tareas`, `Clientes`, `Productos` |
| **Especial** (sin tabla) | No | Pantallas de menu, entrada, login | `EntradaApp`, `MenuPrincipal` |
| **Dependiente** | Depende del padre | Datos hijos de otra coleccion | `LineasPedido` (dentro de `Pedidos`) |

#### Coleccion con datos (persistente)

Se identifica porque tiene los atributos `sql` y `objname`:

```xml
<coll name="Clientes"
      sql="SELECT * FROM ##PREF##Clientes"
      objname="Clientes"
      updateobj="Clientes"
      loadall="true">
    <!-- Esta coleccion TIENE tabla en la BD: gen_clientes -->
</coll>
```

El atributo `objname` es la clave: le dice a XOne que esta coleccion necesita una tabla en la base de datos. Sin `objname`, la coleccion solo existe en memoria.

#### Coleccion especial (sin tabla)

Se identifica porque tiene `special="true"` y NO tiene `objname`:

```xml
<coll name="EntradaApp" title="Bienvenido"
      special="true" notab="true" show-toolbar="false">
    <!-- Esta coleccion NO tiene tabla, es solo una pantalla -->
</coll>
```

#### Colecciones base vs colecciones adicionales

| Aspecto | Colecciones Base | Colecciones Adicionales |
|---------|-----------------|----------------------|
| **Cuales son** | `Empresas`, `Usuarios` | Todas las demas |
| **Donde se definen** | `mappings.xne` | Archivos `.xne` separados |
| **Son obligatorias?** | Si, siempre | Solo las que necesite el proyecto |
| **Campos obligatorios** | Si (ver sección 4.3) | Los que defina el desarrollador |

#### Herencia entre colecciones (`inherits`)

Una coleccion puede heredar la estructura (grupos, frames, props y eventos) de otra usando el atributo `inherits` en el nodo `<coll>`. La hija sobrescribe los elementos del padre que tengan el mismo `name`, y conserva el resto.

```xml
<coll name="groupsFixed" special="true">
    <!-- Header y footer comunes... -->
</coll>

<coll name="PantallaX" inherits="groupsFixed" special="true">
    <!-- Hereda todo de groupsFixed y añade lo propio -->
</coll>
```

Uso típico: scaffolding visual compartido (header/footer/navegación) definido una sola vez en una coll `special="true"` y reutilizado por todas las pantallas que lo necesiten. Soporta cadenas (A → B → C) pero NO herencia multiple. Para la referencia completa y `<include-layout>`, ver topics/02d-xml-layouts-herencia.md, sección 10.

### 6.2 Objetos de Datos (DataObject)

Un **DataObject** (u "objeto de datos") es una instancia individual de una coleccion. Si la coleccion es una tabla, el DataObject es una fila.

#### Acceso al objeto actual: `self`

Dentro de cualquier script de una coleccion, `self` referencia al DataObject actual:

```javascript
// Leer un campo del objeto actual
let nombre = self.NOMBRE;
let codigo = self.CODIGO;

// Escribir un campo
self.NOMBRE = "Nuevo nombre";
self.ESTADO = "COMPLETADO";

// Ambas sintaxis son validas:
let valor1 = self.MAP_CAMPO;      // Notacion punto
let valor2 = self["MAP_CAMPO"];   // Notacion corchetes (util con nombres dinamicos)
```

#### Métodos disponibles del DataObject

```javascript
// Guardar cambios en la BD
self.save();

// Obtener la coleccion propietaria
let coll = self.getOwnerCollection();
let nombreColl = coll.getName();

// Obtener contenidos embebidos (colecciones hijas)
let comentarios = self.getContents("@Comentarios");

// Cargar datos desde JSON
self.loadFromJson('{"NOMBRE": "Test", "CODIGO": 1}');

// Exportar a JSON
let jsonObj = self.toJson();
let jsonStr = self.toJsonString();
```

#### Concepto de Campos MAP_

El prefijo `MAP_` es una **señal al framework** que indica: *"este prop NO es una columna de la tabla BD, no intentes persistirlo"*. Cuando el framework lee un `<prop>` cuyo `name` empieza por `MAP_`, lo excluye de los `INSERT` y `UPDATE` que se generan contra la tabla apuntada por `objname`. Por eso **`MAP_loquesea` no existe ni debe existir como columna en la base de datos**.

**Regla de oro:** Si el valor del prop NO proviene de una columna de la tabla de `objname`, su `name` **debe empezar por `MAP_`**.

##### Los tres casos en los que se usa MAP_

**Caso 1 — Campos que vienen de un JOIN en el SQL de la coll**

Cuando la coleccion hace un `LEFT JOIN` a otra tabla para mostrar una descripción, el alias del campo enlazado debe empezar por `MAP_`:

```xml
<coll name="Pedidos"
      sql="SELECT t1.*,
           c.NOMBRE AS MAP_NOMBRECLIENTE,
           c.TELEFONO AS MAP_TELEFONOCLIENTE
           FROM ##PREF##Pedidos t1
           LEFT OUTER JOIN ##PREF##Clientes c ON t1.IDCLIENTE=c.ID"
      objname="pedidos"
      updateobj="pedidos"
      progid="ASData.CASBasicDataObj">

    <group name="General" id="1">
        <!-- FK normal: SI es columna de la tabla Pedidos -->
        <prop name="IDCLIENTE" type="N" visible="7" mapcol="Clientes" mapfld="ID" />

        <!-- Campos del JOIN: NO son columnas de Pedidos, llevan MAP_ -->
        <prop name="MAP_NOMBRECLIENTE"   type="T" visible="7" locked="true" fieldsize="150" />
        <prop name="MAP_TELEFONOCLIENTE" type="T" visible="7" locked="true" fieldsize="20" />
    </group>
</coll>
```

**Caso 2 — Campos enlazados via `linkedto` (combos/lookups)**

El patron combo en XOne usa dos props: uno oculto que guarda el ID (es columna BD, sin `MAP_`) y otro visible que muestra la descripción obtenida del lookup (no es columna BD, lleva `MAP_`):

```xml
<!-- Prop oculto: guarda el ID del tipo. SI es columna de la tabla -->
<prop name="IDTIPO" type="N" visible="0"
      mapcol="TiposProducto" mapfld="ID" />

<!-- Prop visible: muestra la descripción obtenida del lookup. NO es columna -->
<prop name="MAP_TIPO_DESC" type="T" visible="1"
      title="Tipo de producto"
      linkedto="IDTIPO"
      linkedfield="DESCRIPCION"
      showinline="true" />
```

**Caso 3 — Props puramente visuales (sin origen de datos)**

Cualquier prop que no representa un dato guardable también debe llevar `MAP_`: etiquetas, botones, valores calculados en runtime, estados de UI, buscadores temporales, imágenes decorativas, etc.

| Uso | Ejemplo | Tipo típico |
|-----|---------|-------------|
| Etiquetas / títulos | `MAP_TITULO`, `MAP_SUBTITULO` | `L` (alias legacy: `TL`) |
| Botones | `MAP_BTN_GUARDAR`, `MAP_BTN_CANCELAR` | `B` |
| Valores calculados | `MAP_TOTAL`, `MAP_SUBTOTAL_IVA` | `N2`, `F` |
| Estados de UI | `MAP_TAB`, `MAP_MODO`, `MAP_SELECCIONADO` | `T`, `N`, `NC` |
| Buscadores / filtros | `MAP_BUSQUEDA`, `MAP_FILTRO` | `T` |
| Imágenes decorativas | `MAP_LOGO` | `IMG` |
| Callbacks / objetos JS | `MAP_CALLBACK` | `O` |

```xml
<!-- Etiqueta (no se guarda) -->
<prop name="MAP_TITULO" type="L" title="Gestion de Pedidos" class="textoTitulo" />

<!-- Botón (no se guarda) -->
<prop name="MAP_BTN_GUARDAR" type="B" visible="1" title="Guardar"
      method="executenode(guardar)" />

<!-- Total calculado en runtime (no se guarda) -->
<prop name="MAP_TOTAL" type="N2" visible="1" locked="true" title="Total" />

<!-- Buscador temporal (no se guarda) -->
<prop name="MAP_BUSQUEDA" type="T" visible="1" title="Buscar" onchange="Refresh" />
```

##### Mecanismo interno y consecuencias

- El framework **excluye** los `MAP_*` de los `INSERT` y `UPDATE` contra `objname`.
- El valor vive **solo en memoria** dentro del DataObject (`self`), durante la vida de la pantalla.
- Se lee y escribe normalmente desde JavaScript: `self.MAP_CAMPO`, `self["MAP_CAMPO"]` o `self.getValue("MAP_CAMPO")`.
- Se puede referenciar en `disablevisible`, en macros de CSS/XML (`##FLD_MAP_xxx##`), y como destino de `ui.refresh("MAP_xxx")`.
- Los `MAP_` **no son de solo lectura**: se les puede asignar valor desde JS, desde `<action name="setval">`, desde un `linkedto`, etc. El `locked="true"` de los ejemplos es una decisión de UI, no una consecuencia de ser MAP_.

##### Comparativa: con y sin MAP_

```xml
<!-- Este campo SI se guarda en BD (es columna de la tabla) -->
<prop name="NOMBRE" type="T" visible="7" fieldsize="100" />

<!-- Este campo NO se guarda en BD (prefijo MAP_ -> el framework lo excluye) -->
<prop name="MAP_BTN_EDITAR" type="B" visible="7" title="Editar" />
```

##### Anti-patrones (errores típicos)

| Error | Consecuencia |
|-------|--------------|
| Poner `MAP_` a un campo que SI esta en la tabla BD | El framework no lo persiste: el dato se pierde al guardar |
| Omitir `MAP_` en un alias de JOIN | El framework intenta hacer UPDATE de esa columna: error SQL porque no existe |
| Omitir `MAP_` en el prop visible de un combo con `linkedto` | El framework intenta guardar la descripción como columna: error SQL |
| Poner `MAP_` a una etiqueta `L`/`TL` que se conecta a un campo BD | La etiqueta no refleja el dato persistido correctamente |
| Declarar una columna `MAP_LOQUESEA` en la tabla SQL | No se usa nunca: el framework nunca escribe en ella |

### 6.3 Propiedades (Props)

Las propiedades (`<prop>`) son el elemento fundamental de XOne. Tienen un **rol dual**:

1. **Campo de datos**: Define un dato (nombre, tipo, tamaño)
2. **Elemento visual**: Define como se ve y se interactua con ese dato

#### Sistema de Tipos

Cada propiedad tiene un `type` que determina tanto el tipo de dato como el control visual:

| Type | Nombre | Dato | Control Visual | Ejemplo |
|------|--------|------|---------------|---------|
| `T` | Texto | String | Campo de texto editable | Nombres, descripciones |
| `L` | Texto Label | String | Texto de solo lectura — forma preferida. Sin `title`, muestra el valor del campo | Títulos, etiquetas |
| `TL` | Texto Label (alias legacy) | String | Alias legacy de `L`: mismo control. | Equivalente a `L` |
| `N` | Numérico | Integer | Campo numérico | IDs, cantidades |
| `N2` | Numérico 2 dec | Real (2 decimales) | Campo decimal | Precios, porcentajes |
| `N6` | Numérico 6 dec | Real (6 decimales) | Campo decimal preciso | Coordenadas GPS |
| `B` | Botón | No persiste | Botón de acción | Guardar, Cancelar |
| `IMG` | Imagen | Ruta (String) | Visor/captura de imagen | Fotos, logos |
| `NC` | Checkbox | Integer (0/1) | Toggle/checkbox | Activo si/no |
| `D` | Fecha | String (fecha) | Selector de fecha | Fecha nacimiento |
| `DT` | Fecha/Hora | String (datetime) | Selector fecha + hora | Timestamps |
| `X` | Password | String | Campo enmascarado | Contrasenas |
| `Z` | Zona/Content | No persiste | Lista embebida | Listas dentro de pantalla |
| `DR` | Firma/Dibujo | Ruta (String) | Canvas de firma o dibujo libre | Firma digital |

> Para la tabla completa de tipos y sus variantes, consulta 02 - Estructura XML y Colecciones.

#### Bitmask de Visibilidad

El atributo `visible` usa un **mapa de bits** para controlar donde se muestra cada propiedad:

| Valor | Significado | Cuando se usa |
|-------|-------------|---------------|
| `0` | Oculto | Campos internos, IDs, ROWIDs |
| `1` | Solo en modo edición | Campos que solo se ven al editar un registro |
| `2` | Solo en modo lista | Campos que solo se ven en el listado |
| `4` | Solo en contents | Campos visibles dentro de listas embebidas |
| `7` | Visible en todos los modos | Campos que siempre deben mostrarse (1+2+4=7) |

**Ejemplo práctico:**

```xml
<!-- Oculto: el usuario nunca lo ve, pero se usa internamente -->

<!-- Solo visible al editar un registro individual -->
<prop name="DESCRIPCION_DETALLADA" type="T" visible="1" />

<!-- Solo visible en la lista de registros -->
<prop name="RESUMEN" type="L" visible="2" />

<!-- Visible en todos los contextos -->
<prop name="NOMBRE" type="T" visible="7" />
```

#### Visibilidad Condicional

Además del bitmask estático, se puede controlar la visibilidad de forma dinámica con `disablevisible`:

```xml
<!-- Se oculta si MAP_TIPO es igual a 0 -->
<prop name="MAP_CAMPO_EXTRA" type="T"
      disablevisible="MAP_TIPO=0" />

<!-- Se oculta si MAP_MODO es vacio -->
<frame name="frmAvanzado"
       disablevisible="MAP_MODO=''" >
    <!-- Contenido avanzado -->
</frame>
```

### 6.4 Prefix PREF

El **prefijo** es un concepto fundamental en XOne que conecta las colecciones con las tablas de la base de datos.

#### Que es?

El prefijo (configurado en `app.xml` con el atributo `prefix`) se antepone al nombre de cada tabla en la base de datos. Por defecto, el prefijo es `"gen"`.

#### Como funciona?

```
prefix = "gen"
+
objname = "Tareas"
=
Tabla en BD: gen_tareas
```

#### La macro ##PREF##

En las consultas SQL de las colecciones, se usa la macro `##PREF##` para que el sistema inserte automáticamente el prefijo con el guion bajo:

```xml
<!-- Esto: -->
<coll name="Tareas" sql="SELECT * FROM ##PREF##Tareas" ...>

<!-- Se convierte en tiempo de ejecución en: -->
<!-- SELECT * FROM gen_tareas -->
```

#### Por que usar ##PREF## en vez de escribir "gen_" directamente?

Porque el prefijo puede cambiar entre proyectos. Si un cliente tiene prefijo `"inv"`, la misma consulta generara:

```
SELECT * FROM inv_Tareas
```

Sin necesidad de modificar ningun archivo `.xne`.

> **Error común:** Olvidar `##PREF##` en las consultas SQL. Si escribes `SELECT * FROM Tareas`, la consulta fallara porque la tabla real se llama `gen_tareas`.

### 6.5 Macros del Sistema

XOne proporciona macros que se resuelven en tiempo de ejecución. Se identifican por estar entre dobles `##`:

#### Macros de Base de Datos

| Macro | Descripción | Ejemplo de uso |
|-------|-------------|----------------|
| `##PREF##` | Prefijo de tablas + guion bajo | `sql="SELECT * FROM ##PREF##Tareas"` |
| `##ENTID##` | ID de la empresa actual | `filter="IDEMPRESA=##ENTID##"` |
| `##USERID##` | ID del usuario logueado | `filter="ID_USUARIO=##USERID##"` |

#### Macros de Aplicación

| Macro | Descripción | Ejemplo de uso |
|-------|-------------|----------------|
| `##VERSION##` | Versión de la app (definida en `<app versión="...">`) | `title="Versión ##VERSION##"` |
| `##FRAME_VERSION##` | Versión del framework XOne | `title="Framework ##FRAME_VERSION##"` |
| `##APP##` | Ruta de la carpeta de la aplicación en el dispositivo | `path="##APP##\icons\imagen.png"` |
| `##LOGIN_LASTUSER##` | Último usuario que hizo login | Pre-rellenar campo de login |

#### Macros de Dispositivo

| Macro | Descripción | Ejemplo de uso |
|-------|-------------|----------------|
| `##DEVICEID##` | Identificador único del dispositivo | `filter="DEVICE=##DEVICEID##"` |
| `##DEVICE_MODEL##` | Modelo del dispositivo | `title="Modelo: ##DEVICE_MODEL##"` |
| `##DEVICE_OS##` | Sistema operativo del dispositivo (`"android"` o `"ios"`) | `value="MyApp_##DEVICE_OS##"` |

Las macros de dispositivo se pueden leer también desde JavaScript:

```javascript
var so = appData.getGlobalMacro("##DEVICE_OS##");
var deviceId = appData.getGlobalMacro("##DEVICEID##");
var modelo = appData.getGlobalMacro("##DEVICE_MODEL##");
```

#### Cerrar pantalla / cerrar aplicación

Formas correctas desde JavaScript:

```javascript
// Cerrar la pantalla actual y volver a la anterior
ui.getView(self).exit();

// Cerrar completamente la aplicación
appData.exit();
```

**Nota sobre código heredado:** En proyectos antiguos puede aparecer el patrón `appData.failWithMessage(-11888, "##EXIT##")` (con la macro `##EXIT##` y el código `-11888`) para cerrar la pantalla. Sigue funcionando, pero la forma preferida es `ui.getView(self).exit()`.

#### Macros de Fecha/Hora

| Macro | Descripción | Formato |
|-------|-------------|---------|
| `##NOW##` | Fecha y hora actual del sistema | Depende de la configuración |
| `##NOW_DATE##` | Fecha actual | `dd/MM/yyyy` |
| `##NOW_TIME##` | Hora actual | `HH:mm:ss` |

#### Macros de Campo (`##FLD_CAMPO##`)

Las macros `##FLD_CAMPO##` se resuelven al valor actual del campo especificado. Son extremadamente útiles para crear interfaces dinámicas:

| Uso | Descripción | Ejemplo |
|-----|-------------|---------|
| Filtros de contents | Filtrar datos hijos por campo del padre | `filter="ID_PADRE=##FLD_ID##"` |
| Colores dinámicos | Cambiar colores según un campo | `bgcolor="##FLD_MAP_COLOR##"` |
| Textos dinámicos | Mostrar texto variable en atributos | `title="##FLD_MAP_TITULO##"` |
| Imágenes dinámicas | Cambiar imagen según un campo | `img="##FLD_MAP_ICONO##"` |

```xml
<!-- Color de fondo dinámico basado en un campo -->
<prop name="MAP_LABEL" type="L"
      bgcolor="##FLD_MAP_COLOR1##"
      forecolor="##FLD_MAP_COLOR2##" />

<!-- Imagen dinámica basada en un campo -->
<prop name="BTORDENAR" type="B"
      img="##FLD_MAP_BTORDEN##"
      imgsel="##FLD_MAP_BTORDENCLICK##" />

<!-- Filtro de contents con campo del padre -->
<contents name="@Detalles" src="Detalles"
          filter="ID_PADRE=##FLD_ID##" />

<!-- Color dinámico en CSS de frame -->
.frmsuperior {
    bgcolor: ##FLD_MAP_COLORACTIVO##;
}
```

#### Ejemplo de uso combinado de macros

```xml
<!-- Macro en consulta SQL -->
<coll name="MisTareas"
      sql="SELECT * FROM ##PREF##Tareas WHERE ID_USUARIO = ##USERID##">

<!-- Macro en evento create para mostrar version -->
<create>
    <action name="setval" field="MAP_VERSION"
            value="Versión ##VERSION## - Framework ##FRAME_VERSION##" />
</create>

<!-- Macro de campo para color dinámico -->
<prop name="MAP_INDICADOR" type="L"
      bgcolor="##FLD_MAP_COLOR_ESTADO##" />
```

#### Macros de Animación

XOne tiene animaciones predefinidas accesibles via macros. Las más comunes:

| Macro | Efecto |
|-------|--------|
| `##ALPHA_IN##` / `##ALPHA_OUT##` | Aparecer / Desaparecer (fade) |
| `##ZOOM_IN##` / `##ZOOM_OUT##` | Zoom de entrada / salida |
| `##LEFT_IN##` / `##LEFT_OUT##` | Entrar / salir desde la izquierda |
| `##RIGHT_IN##` / `##RIGHT_OUT##` | Entrar / salir desde la derecha |
| `##TOP_IN##` / `##BOTTOM_IN##` | Entrar desde arriba / abajo |
| `##PUSH_IN##` / `##PUSH_OUT##` | Empujar hacia arriba / abajo |
| `##PUSH_DOWN_IN##` / `##PUSH_DOWN_OUT##` | Empujar hacia abajo (entrada / salida) |
| `##SLIDE_DOWN_IN##` / `##SLIDE_UP_OUT##` | Deslizamiento hacia abajo / arriba |

```javascript
// Mostrar grupo 2 con animacion fade
ui.showGroup(2, "##ALPHA_IN##", 200, "##ALPHA_OUT##", 200);
```

```xml
<!-- Animacion en frames -->
<frame name="frmDetalle"
       animation-in="##RIGHT_IN##"
       animation-out="##LEFT_OUT##"
       animation-in-delay="250"
       animation-out-delay="250" />

<!-- Animacion en colecciones especiales -->
<coll name="EspecialMenu" special="true"
      animation-in="##RIGHT_IN##"
      animation-out="##LEFT_OUT##">
```

> Para la lista completa de macros de animación y ejemplos avanzados, consulta 05 - Eventos, Patrones y FAQ.

### 6.6 Códigos de Error

XOne utiliza códigos de error numéricos especificos para controlar el flujo de la aplicación. Los dos códigos más importantes son:

| Código | Significado | Uso |
|--------|------------|-----|
| `-8100` | Campos obligatorios faltantes / validación | `appData.failWithMessage(-8100, "mensaje")` |
| `-11888` | Código heredado para cerrar pantalla con la macro `##EXIT##` (forma preferida hoy: `ui.getView(self).exit()`) | `appData.failWithMessage(-11888, "##EXIT##")` |

#### Uso del código -8100 (Validación)

El código `-8100` se usa para interrumpir una operación cuando faltan datos obligatorios o una validación no se cumple. Muestra un mensaje al usuario y cancela la acción en curso:

```javascript
// Validar antes de guardar
function validarFormulario() {
    if (!self.NOMBRE || self.NOMBRE === "") {
        appData.failWithMessage(-8100, "El campo Nombre es obligatorio");
        return false;
    }
    if (!self.EMAIL || self.EMAIL === "") {
        appData.failWithMessage(-8100, "El campo Email es obligatorio");
        return false;
    }
    return true;
}
```

#### Cerrar pantalla / aplicación (control de flujo)

Formas correctas desde JavaScript:

```javascript
// Salir de la pantalla actual (volver atrás)
ui.getView(self).exit();

// Salir completamente de la aplicación
appData.exit();
```

**Código heredado:** Algunos proyectos antiguos usan `appData.failWithMessage(-11888, "##EXIT##")` para cerrar la pantalla. Sigue funcionando, pero las formas de arriba son preferidas.

#### Verificación de errores después de operaciones

Después de operaciones como `save()`, se puede verificar si ocurrio un error:

```javascript
self.save();
if (appData.error().getNumber() != 0) {
    ui.showToast("Error: " + appData.error().getDescription());
    appData.error().clear();
}
```

| Método | Descripción |
|--------|-------------|
| `appData.error().getNumber()` | Devuelve el código numérico del último error (0 = sin error) |
| `appData.error().getDescription()` | Devuelve la descripción textual del error |
| `appData.error().clear()` | Limpia el estado de error actual |

### 6.7 Sintaxis JavaScript soportada por el motor

El motor JavaScript de XOne está basado en un **fork de Mozilla Rhino** fuertemente parcheado en Java 17, con backports selectivos: soporta **ES5 completo + buena parte de ES6+** (incluyendo `class` y `Promise`). No es ES2015 completo. Conocer qué piezas concretas funcionan evita errores en tiempo de parseo o de ejecución.

#### Sintaxis ES6+ SÍ disponible

| Característica ES6+ | Notas |
|---------------------|-------|
| `let` / `const` | Funcionan con su semántica de *block scope*. |
| Arrow functions `() => {}` | Funcionan, incluido el binding léxico de `this`. |
| Destructuring `var {a, b} = obj` y de parámetros `function f({x, y})` | Funciona. |
| `for...of` | Sobre `String`, `Array` y arrays-like. NO funciona sobre generators del fork (que son estilo legacy SpiderMonkey, ver fila siguiente). |
| Generadores con `yield` | Funcionan. El parser acepta dos sintaxis: (a) función normal con `yield` en el cuerpo (detección retroactiva, estilo legacy), y (b) la sintaxis explícita `function*` / `*method()` dentro de class. Ambas equivalentes. **Runtime estilo SpiderMonkey legacy**: `gen.next()` devuelve el valor directamente (no `{value, done}`) y lanza `StopIteration` al terminar. `for...of` NO los itera; usar `try { while (true) v = iter.next(); ... } catch (e) {}`. |
| `Symbol` / `Symbol.iterator` | Iteración estándar sobre nativos. |
| `class` ES6+ | Declaraciones, expresiones, `extends`, `super`, `static`, getters/setters, computed keys (`[expr]() {}`), **field declarations** (`field = expr;` / `static field = expr;`), **generator methods** (`*method()` / `static *method()`). Implementado vía desugar a `function` + `prototype`. NO soporta: private fields (`#name`), static blocks, `new.target`. Ver sección dedicada en este archivo. |
| `Promise` (custom, ES2024-compatible) | API completa: constructor, `resolve`, `reject`, `all`, `allSettled`, `race`, `any` (con `AggregateError`-like), `withResolvers`. Instancia: `.then`, `.catch`, `.finally`, `.status`. Implementación custom en el módulo `xonejavascript_lib/objects/promises/Promise`. Limitaciones: no hay microtask scheduling real (callbacks despachan en threads); asimilación de thenables solo para Promise nativos (no objetos genéricos con `.then`). |
| Métodos modernos de `String` | `padStart`, `padEnd`, `replaceAll`, `matchAll`, `at`, `trimStart`, `trimEnd`, `includes`, `startsWith`, `endsWith`, `repeat`, `normalize`, `codePointAt`, `fromCodePoint`, `String.raw` (forma con objeto manual), `isWellFormed`, `toWellFormed` — todos los del estándar hasta ES2024. |
| Métodos modernos de `Array` | `map`, `filter`, `reduce`, `forEach`, `find`, `findIndex`, `includes`, `some`, `every` — disponibles desde ES5/ES6. |
| Typed arrays | `Int8Array`, `Uint8Array`, `Int16Array`, `Uint16Array`, `Int32Array`, `Uint32Array`, `Float32Array`, `Float64Array`, `ArrayBuffer`. |
| `JSON.parse()` / `JSON.stringify()` | Estándar. |

#### Sintaxis ES6+ NO disponible

| Característica ES6+ | Por qué falla | Alternativa en XOne |
|---------------------|--------------|---------------------|
| **Template literals** `` `${var}` `` | El lexer no reconoce el carácter backtick (`` ` ``) — *illegal character*. | Concatenación `"texto " + var` |
| `async` / `await` | Palabras reservadas — parse error. | Callbacks o `Promise` custom (sí soportado, ver arriba). |
| `import` / `export` | No hay sistema de módulos. | `<include>` en `app.xml`, `appData.loadIncludeFile()` |
| Spread/rest `...args` | No implementado. | Usar `arguments` o `apply(thisArg, argsArray)` |
| Default parameters `function f(x=1)` | No implementado. | `function f(x){ if (x===undefined) x = 1; ... }` |
| Computed property names en object literals `{[k]: v}` | El parser no acepta la sintaxis dentro de `{}`. **SÍ** la acepta dentro de cuerpos de clase (`class { [k]() {} }`). | Object literal: crear vacío + asignar `var o = {}; o[k] = v;` |
| Shorthand props `{a, b}` (sin destructuring) | No implementado en object literals. | `{a: a, b: b}` |
| Optional chaining `?.` / nullish coalescing `??` | No implementados. | Chequeos manuales: `obj && obj.x`, `x !== undefined ? x : default` |
| Private fields `#name` en clase | No implementado (necesita runtime con WeakMap-like scoping). | Convención: prefijo `_`, e.g. `this._x`. |
| Static blocks `static { ... }` en clase | No implementado. | Sentencias `ClassName.x = ...;` justo después de la clase. |
| `new.target` dentro de constructores | No implementado. | Convención manual (e.g. `if (!(this instanceof Foo)) ...`). |

#### Sintaxis ES5 (base, siempre disponible)

| Característica | Notas |
|----------------|-------|
| `var` | Function scope. |
| Funciones declarativas `function nombre() {}` | Estándar. |
| `try / catch / finally` | Estándar. |
| `Math`, `Date`, `RegExp` | Globales estándar. |
| `console.{log,info,debug,warn,error,trace,assert,group,groupCollapsed,groupEnd,time,timeLog,timeEnd,count,countReset,dir,dirxml,clear,table}` | API `console` completa (WHATWG-like) con varargs y formato `%s/%d/%i/%f/%o/%O/%j/%%`. |

#### Ejemplo comparativo

```javascript
// INCORRECTO - sintaxis que NO funciona en XOne
var template = `Hola ${nombre}`;              // template literal: parse error
function saludo(nombre = "anon") { }          // default params: parse error
function f(...rest) { }                       // rest params: parse error
var obj = {a, b};                             // shorthand props: parse error
var obj2 = {[k]: 1};                          // computed keys en object literal: parse error
var v = obj?.x;                               // optional chaining: parse error

// CORRECTO - sintaxis válida en XOne
var template = "Hola " + nombre;
function saludo(nombre) { if (nombre === undefined) nombre = "anon"; }
var obj = {a: a, b: b};
var obj2 = {}; obj2[k] = 1;
var v = obj && obj.x;

// SÍ funciona: let/const, arrow functions, destructuring, class, Promise,
// generadores, métodos modernos de String y Array
let saludar = (nombre) => "Hola " + nombre;
const MAX = 10;
let items = lista.map(i => i.nombre);
let [a, b] = [1, 2];                          // destructuring
"5".padStart(3, "0");                         // "005"
"a-b-c".replaceAll("-", "+");                 // "a+b+c"
"abc".at(-1);                                 // "c"

class Persona {                               // class declarations
    edad = 0;                                 // field declaration (instance)
    static contador = 0;                      // field declaration (static)
    constructor(nombre) {
        this.nombre = nombre;
        Persona.contador++;
    }
    saludar() { return "Hola, soy " + this.nombre; }
    static crear(n) { return new Persona(n); }
    *iterFields() { yield this.nombre; yield this.edad; }  // generator method
}
class Empleado extends Persona {              // extends + super
    constructor(nombre, rol) {
        super(nombre);
        this.rol = rol;
    }
    saludar() { return super.saludar() + " (" + this.rol + ")"; }
}
var e = new Empleado("Juan", "dev");
e.saludar();                                  // "Hola, soy Juan (dev)"

new Promise((resolve, reject) => {            // Promise ES2024
    setTimeout(() => resolve(42), 100);
}).then(v => console.log(v))                  // .then funciona
  .catch(err => console.error(err))           // .catch funciona (ya no es .Catch)
  .finally(() => console.log("listo"));       // .finally también

Promise.all([p1, p2]).then(([a, b]) => {});  // estáticos completos
Promise.allSettled([p1, p2]);
Promise.any([p1, p2]);
const { promise, resolve, reject } = Promise.withResolvers();
```

#### APIs de navegador NO disponibles

XOne no ejecuta JavaScript en un navegador. Las siguientes APIs **no existen**:

| API NO disponible | Alternativa XOne |
|-------------------|-----------------|
| `document.getElementById()` | `ui.getView(self)` o `getControl("X")` |
| `window` / `window.location` / `window.history` | `ui.openEditView(...)`, `ui.getView(self).exit()` |
| `localStorage` / `sessionStorage` | `appData.setGlobalMacro` / `appData.getGlobalMacro` |
| `XMLHttpRequest()` | `$http.get/post/...` (idiomático) o `fetch(url, init)` (ver tabla siguiente) |
| `navigator.geolocation` | `ui.startGps({nodeName: "..."})` / `new GpsTools()` |
| `alert()` / `confirm()` / `prompt()` | `ui.msgBox()` / `ui.showToast()` |
| `async` / `await` (palabras reservadas, parse error) | Callbacks o `Promise` (sí soportado vía implementación custom — ver tabla siguiente). |

#### APIs WHATWG/Node SÍ disponibles (implementación custom XOne)

Compatible con la semántica de la spec, registrado en `RhinoJavascriptEngine.addNativeJavascriptObjects`:

| API | Notas |
|-----|-------|
| `console.{log,info,debug,warn,error,trace,assert,group,groupCollapsed,groupEnd,time,timeLog,timeEnd,count,countReset,dir,dirxml,clear,table}` | Varargs y formato `%s/%d/%i/%f/%o/%O/%j/%%`. |
| `fetch(input, init?)` | Devuelve `Promise<Response>`. Soporta `method`, `headers`, `body` (string / `URLSearchParams` / `ArrayBuffer` / typed array), `signal`. **NO** soporta `Request` como primer arg, body `FormData`/`Blob`/`ReadableStream`, ni cancelación in-flight real (el `AbortSignal` solo rechaza el Promise; la red sigue en background). Ignora `mode/credentials/cache/redirect/referrer/integrity/keepalive`. |
| `Response` | `status`, `ok`, `headers`, `url`, `text()`, `json()`, `arrayBuffer()`, `clone()`. |
| `Headers` | Case-insensitive, multi-valor con `, ` (regla WHATWG). |
| `AbortController` / `AbortSignal` | `signal.aborted`, `abort(reason)`, hereda de `EventTarget`. |
| `setTimeout` / `clearTimeout` / `setInterval` / `clearInterval` / `queueMicrotask` | Tiempos en **ms** (semántica spec). El patrón XOne idiomático sigue siendo `ui.executeActionAfterDelay(node, segundos)` para un disparo único integrado con la UI, pero `setTimeout` con `(fn, ms)` también es válido. |
| `Promise` | ES2024 casi completo. Estáticos: `resolve`, `reject`, `all`, `allSettled`, `race`, `any`, `withResolvers`. Instancia: `.then`, `.catch`, `.finally`, `.status` (`"pending"`/`"fulfilled"`/`"rejected"`). Limitación: no hay microtask scheduling real; asimilación de thenables solo para instancias de `Promise`. |
| `URL` / `URLSearchParams` | Constructores estilo WHATWG. |
| `EventTarget` | `addEventListener`, `removeEventListener`, `dispatchEvent`, opción `once`. |
| `TextEncoder` (UTF-8) / `TextDecoder` (UTF-8/16/Latin-1/ASCII + fallback `Charset.forName`) | |
| `performance.now()` / `performance.timeOrigin` | |
| `atob` / `btoa` | WHATWG, Latin-1. |
| `structuredClone` | Detección de ciclos; soporta Date/RegExp/Array/objeto/ArrayBuffer/typed arrays. |
| `DOMParser` / `XMLSerializer` | |
| `globalThis` | Auto-referencia al scope global. |
| `crypto`, `clipboard`, `deviceInfo`, `systemSettings`, `packageManager`, `biometricsManager`, … | Singletons XOne; ver tópico 06. |

> Para más detalles sobre buenas prácticas de JavaScript en XOne, consulta 03 - Guía de API JavaScript.
