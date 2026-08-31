# XOne XML — Referencia de atributos: method, macro, script, event, platform, tipos y app

> Fuente: `xone/v2/xone-help-docs/topics/07-xml-attributes-reference.md` §5–§11. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §5 method · §6 macro · §7 script · §8 eventos disponibles · §9 platform (override por plataforma) · §10 tipos de propiedad · §11 atributos globales de la app

---

## 5. Nodo `<method>` — Método ejecutable

Define un método reutilizable que puede ser invocado desde scripts via `self.executeNode("nombre")`.

| Atributo | Tipo | Obligatorio | Default | Descripción |
|---|---|---|---|---|
| `name` | string | **Si** | — | Nombre único del método dentro de la coll. |
| `language` | enum | No | lenguaje por defecto | `javascript` (recomendado). `vbscript` esta descontinuado. |
| `params` | string | No | `""` | Parámetros separados por coma. |
| `return-type` | string | No | `""` | Tipo de retorno. |
| `execute-async` | bool | No | `false` | Ejecuta de forma asíncrona. |
| `disableedit` | formula | No | `""` | Si verdadero, el método no puede ejecutarse. |

Requiere nodo hijo `<script language="javascript">` con el código.

```xml
<method name="calcularTotal" language="javascript">
    <script language="javascript">
        var base = self.getValue("IMPORTE_BASE");
        var iva  = base * 0.21;
        self.setValue("IVA", iva);
        self.setValue("TOTAL", base + iva);
    </script>
</method>
```

> Llamada desde otro script: `self.executeNode("calcularTotal");`

---

## 6. Nodo `<macro>` — Macro de coleccion

Variable de tipo string con ambito de la coleccion, usable en SQL y filtros mediante la sintaxis `##NOMBRE##`.

| Atributo | Tipo | Obligatorio | Default | Descripción |
|---|---|---|---|---|
| `name` | string | **Si** | — | Nombre de la macro. Usar formato `##NOMBRE##`. |
| `value` | string | No | `""` | Valor inicial de la macro. |
| `default` | bool | No | `false` | Si `true`, se usa como valor por defecto. |

**Reglas críticas:**
- El nodo `<macro>` se declara como **hijo directo de `<coll>`**, al mismo nivel que los `<group>`.
- Sin declaración del nodo, `setMacro("##X##", valor)` no tiene efecto en el SQL.
- Para leer/escribir desde JS: `selfDataColl.getMacro("##X##")` / `selfDataColl.setMacro("##X##", valor)`.
- Para macros globales (toda la app): `appData.getGlobalMacro` / `appData.setGlobalMacro`.

```xml
<coll name="Pedidos" sql="SELECT * FROM ##PREF##Pedidos WHERE estado = ##FILTRO_ESTADO##">
    <macro name="##FILTRO_ESTADO##" value="'pendiente'" default="true" />
    <group name="grp1" id="1">
        <!-- ... -->
    </group>
</coll>
```

---

## 7. Nodo `<script>` — Script

Nodo que contiene código JavaScript. Puede ser hijo de eventos, métodos o usarse inline.

| Atributo | Tipo | Obligatorio | Default | Descripción |
|---|---|---|---|---|
| `name` | string | No | `""` | Identificador del script. |
| `language` | enum | No | lenguaje por defecto | `javascript` (recomendado). No usar `vbscript`. |
| `type` | string | No | `text/javascript` | MIME type alternativo. |
| `src` | string | No | `""` | URL o ruta a fichero externo. |
| `ext-file` | string | No | `""` | Fichero externo relativo al proyecto. |

**Escape XML del JS embebido.** Para JS no trivial, **forma preferida**: declarar la función en un fichero `.js` externo (`functions.js` u otro `<include>`-ado) y llamarla desde el `.xne` con `miFuncion();` — así el JS se escribe normal y el XML solo invoca. Para snippets cortos inline, hay dos formas válidas: (a) entidades XML dentro del JS (`&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`), o (b) envolver el bloque en `<![CDATA[…]]>` (solo válido dentro de nodos `<script>`; NO dentro de atributos XML como `onclick="…"`).

(fence sin lenguaje para que las entidades se rendericen literales)

```
<!-- OPCIÓN A: entidades XML -->
<script language="javascript">
    if (a &gt; 0 &amp;&amp; b &lt; 10) {
        self.setValue("RESULTADO", a + b);
    }
</script>

<!-- OPCIÓN B: CDATA (también válido dentro de <script>) -->
<script language="javascript"><![CDATA[
    if (a > 0 && b < 10) {
        self.setValue("RESULTADO", a + b);
    }
]]></script>
```

---

## 8. Nodo `<event>` — Eventos disponibles

| Evento | Aplicable a | Cuando dispara |
|---|---|---|
| `<create>` | coll | Una sola vez al crear el objeto (primera apertura). |
| `<before-edit>` | coll | Al abrir para edición. **Usar para inicializar pantalla.** |
| `<after-edit>` | coll | Después de entrar en modo edición. |
| `<load>` | coll | Se dispara **por cada DataObject** al cargarse desde la BD (startBrowse/loadAll/`<contents>`/cargas individuales). **NO es evento de pantalla** y **NO recomendado** por impacto en rendimiento. |
| `<onchange>` + `<field name="X">` | coll, prop | Al cambiar el valor del campo indicado. |
| `<selecteditem>` | coll | Al seleccionar un item en lista. |
| `<auto-selecteditem>` | coll | Selección automática al cargar. |
| `<onlongpressitem>` | coll | Pulsacion larga sobre un item. |
| `<onback>` | coll | Al pulsar el botón atrás. |
| `<onfocus>` | prop | Al recibir foco. |
| `<delete>` (con `<rule>` hijos) | coll | Define **reglas de borrado** que se evaluan antes de eliminar un objeto. No es un evento "antes/después"; es un bloque de reglas (`<rule>` con condiciones SQL/script). |
| `<onlogon>` / `<login-ok>` / `<login-fail>` | coll de login | Flujo de autenticación. |
| `<onlogoff>` | coll | Al cerrar sesión. |
| `<onpushreceived>` | coll Empresas | **Exclusivo de la coll `Empresas`** (`ASGestion.CASEmpresa`). Al recibir una notificación push. |
| `<maintenance>` | coll Empresas | **Exclusivo de la coll `Empresas`.** Tarea de mantenimiento periódico. |
| `<sys-message>` | coll Empresas | **Exclusivo de la coll `Empresas`.** Mensaje de sistema (códigos 1000-1003, ver tópico 05 sección 5D). |
| `<nodoCustom>` | coll | Nodo invocable con `self.executeNode("nodoCustom")`. |

> **Nota:** `onclick` se declara **solo como atributo** del nodo `<prop>`, **nunca como nodo hijo** `<onclick>`. Los siguientes nombres **NO existen en ningún sitio** (ni nodo ni atributo): `onlostfocus`, `onblur`, `onsave`, `oncreate`, `oninit`. Hay además nombres que **SÍ existen como atributo de evento en `<prop>`** pero NO como nodo hijo de `<coll>`: `ontouch`, `onlongpress`, `ontextchanged`, `onfocuschanged`, `oneditoraction`, `onscroll`, `onkeydown`, `onswipe`, `oncodescanned`, `oncheckedchange`, etc. Casos específicos: `ondismiss` (atributo de `<prop>` con `behavior="swipe-dismiss"`), `beforesave`/`aftersave` (atributos de `<executeNode>`).
>
> **Caso especial — `<button>`:** existe como **alias legacy** de `<prop type="B">`. El motor lo trata como propiedad sintética con `type="B"`. **Forma canónica recomendada hoy:** `<prop type="B">`. Solo aparece como `<button>` en proyectos antiguos.

---

## 9. Nodo `<platform>` — Override por plataforma

Permite sobrescribir atributos de cualquier nodo según la plataforma o tipo de dispositivo. Se declara como hijo del nodo que quiere sobreescribir.

| Atributo | Tipo | Obligatorio | Default | Descripción |
|---|---|---|---|---|
| `name` | string | **Si** | — | Plataforma: `android`, `ios`, `windows`. |
| `device` | string | No | `""` | Tipo de dispositivo: `phone`, `hiphone`, `tablet`, `mini`, `watchround`, `watchsquare`. |
| *(cualquier atributo del padre)* | — | No | heredado | Sobrescribe el atributo cuando la plataforma coincide. |

**Orden de resolución de atributos:**
1. `<platform name="...">` que coincide con la plataforma actual.
2. El nodo principal (el padre).
3. Regla CSS por clase.
4. Cadena vacia / valor por defecto.

```xml
<prop name="NOMBRE" type="T" visible="7" width="100%">
    <!-- En tablet, el campo ocupa solo el 50% -->
    <platform name="android" device="tablet">
        <width>50%</width>
    </platform>
</prop>

<coll name="MiPantalla" screen-orientation="portrait">
    <!-- En tablet, la orientacion es libre -->
    <platform name="android" device="tablet">
        <screen-orientation>sensor</screen-orientation>
    </platform>
</coll>
```

---

## 10. Tipos de propiedad (atributo `type`)

| Código | Descripción | Notas |
|---|---|---|
| `T` | Texto editable. | El más usado para campos de texto. |
| `TN` ... `TN6` | Texto numérico con N decimales. | Ej. `TN2` para 2 decimales. |
| `N` ... `N6` | Numérico con N decimales. | `N` = entero, `N2` = 2 decimales. |
| `D` | Fecha. | Requiere `date-format` para personalizar. |
| `DT` | Fecha y hora. | |
| `TT` | Solo hora/reloj. | Requiere `mask="Hh#:#Mm"` para ser visible. |
| `B` | Botón en formulario. | Usar `onclick` como atributo. Soporta también `ontouchdown`/`ontouchup` para distinguir presionar de soltar (interacciones "mantener pulsado"). |
| `L` | Etiqueta de solo lectura (label) — forma preferida. | No editable. Muestra el `title`; sin `title`, usa el valor del campo. Usar `MAP_` siempre que sea posible. |
| `TL` | Alias legacy de `L`: se renderiza igual (label de solo lectura). | Equivalente a `type="L"`; el framework instancia el mismo control. Mantener por compatibilidad. |
| `THTML` | Texto con formato HTML. | Soporta HTML básico. `link-color` para enlaces. |
| `WEB` | WebView embebido. | Carga URLs o HTML local. |
| `IMG` | Imagen referenciada (path o URL). | `scale-type`, `zoom`, `keep-aspect-ratio`. |
| `PH` | Foto capturable con la camara. | Equivalente a `IMG` con captura. |
| `VD` | Video o escaner. | `code-type` para QR/barcode. |
| `DR` | Dibujo/firma. | `stroke-color`, `stroke-width`, `apply-format-to-file`. |
| `NC` | Checkbox/toggle/radio/switch. | `check-type` para variante. |
| `X` | Campo password. | `show-password-visibility-toggle` para ver/ocultar. |
| `Z` | Contenedor de contenidos/lista embebida. | Requiere `contents="NombreColeccion"`. |
| `AT` | Adjunto/fichero. | `attach-allowed` para filtrar tipos MIME. |
| `O` | Sub-objeto JavaScript. | No persiste en BD. Ideal para callbacks. |

---

## 11. Atributos globales de la app

Atributos del nodo raiz `<app>` en `mappings.xne` o `app.xml`.

| Atributo | Tipo | Default | Descripción |
|---|---|---|---|
| `prefix` | string | `""` | Prefijo de tablas (macro `##PREF##`). Ej. `gen` genera `gen_` en el SQL. |
| `versión` | string | — | Versión de la aplicación. |
| `mainentry` | string | — | Coleccion de entry-point (pantalla inicial). |
| `login-coll` | string | — | Coleccion de login. |
| `default-language` | string | `javascript` | Lenguaje de scripts por defecto. Usar siempre `javascript`. |
| `theme` | string | `default` | Tema visual global de la app. |
| `scale-fontsize` | bool | `true` | Escala fuentes según `fontScale` del sistema (accesibilidad). |
| `android-font-factor` | float | `7` | Factor adicional de escala de fuentes en Android. |
| `appname` | string | nombre del fichero | Nombre lógico de la app. |
| `license` | string | — | Licencia de la app. |
| `compatibility-mode` | bool | `false` | Si `true`, ignora COMPLETAMENTE el CSS. |
| `debug` | bool | `false` | Activa el modo debug. |

### Macros de sistema disponibles

| Macro | Descripción |
|---|---|
| `##PREF##` | Prefijo de tablas definido en `app.xml`. |
| `##APP##` | Referencia a la app. |
| `##DEFAULT##` | Valor por defecto. |
| `##MAINFRAME##` | Frame raiz de la aplicación. |
| `##MAINENTRYPOINT##` | Padre del menu principal. |
| `##NOW_TIME##` | Fecha y hora actual. |
| `##DEVICE_OS##` | Sistema operativo del dispositivo. |
| `##DEVICE_OSSDKCODE##` | Código SDK del OS (Android API level). |
| `##DEVICE_TYPE##` | Tipo de dispositivo (`phone`, `tablet`, etc.). |
| `##CURRENT_ORIENTATION##` | Orientación actual (`portrait` o `landscape`). |
| `##FRAME_VERSION_CODE##` | Versión del framework XOne. |
| `##LIVEUPDATE_VERSION##` | Versión del LiveUpdate. |
| `##RIGHT_IN##` | Animación de entrada desde la derecha. |
| `##RIGHT_OUT##` | Animación de salida hacia la derecha. |
| `##LEFT_IN##` | Animación de entrada desde la izquierda. |
| `##LEFT_OUT##` | Animación de salida hacia la izquierda. |
| `##TOP_IN##` | Animación de entrada desde arriba. |
| `##BOTTOM_IN##` | Animación de entrada desde abajo. |
| `##PUSH_IN##` / `##PUSH_OUT##` / `##PUSH_DOWN_IN##` | Variantes de animación tipo push. |
| `##ALPHA_IN##` | Animación de entrada con fade. |
| `##ZOOM_IN##` | Animación de entrada con zoom. |

### Ficheros de configuración del proyecto

| Fichero | Uso |
|---|---|
| `app.ini` | Configuración inicial: Name, Title, Caption, Icon, IconFolder, FilesFolder. |
| `app.xml` | Definición global de la app (prefix, versión, CSS, scripts). |
| `mappings.xne` | Mapping principal: solo colecciones Empresas y Usuarios. Encoding: iso-8859-15. |
| `default.css` | Estilos globales. |
| `functions.js` | Funciones JavaScript globales (carga automática). |
| `license.ini` | Licencia de la aplicación. |

