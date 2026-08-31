# XOne XML — Referencia de atributos: coll, group y frame

> Fuente: `xone/v2/xone-help-docs/topics/07-xml-attributes-reference.md` §1–§3. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §1 todos los atributos de coll · §2 atributos de group · §3 atributos de frame, con tipo, valores permitidos y valor por defecto

---

## 1. Nodo `<coll>` — Coleccion/Pantalla

Define una tabla de datos (mapeada a SQL) o una pantalla de UI. Es el nodo raiz de cada fichero `.xne`.

> **REGLAS GENERALES DE NAMING (aplican a coll/group/frame/prop):**
>
> - **`name` es case-sensitive.** `name="MiNombre"` y `name="minombre"` son **distintos**. Aplica también a referencias cruzadas: `self.X`, `mapcol`, `linkedto`, `inherits`, `<field name="...">`, `getControl("...")`, `ui.openEditView("...")`, `appData.getCollection("...")`.
> - **El `id` de `<group>` es obligatorio y único en la coll.** Dos `<group id="1">` en la misma coll producen comportamiento indefinido.
> - **Unicidad de `name` en la coll.** No puede repetirse el `name` de ningun nodo dentro de una `<coll>`, aunque estén en grupos/frames distintos.

### 1.1 Atributos de identificación y datos

| Atributo | Tipo | Obligatorio | Default | Descripción |
|---|---|---|---|---|
| `name` | string | **Sí** | — | Identificador único de la colección. Usar PascalCase. **Case-sensitive.** |
| `title` | string | No | `name` | Título visible en la UI. |
| `sql` | string | No | — | Sentencia SQL `SELECT`. Usar `##PREF##` para el prefijo de tabla. |
| `objname` | string | No | — | Nombre de la tabla para operaciones de lectura. |
| `updateobj` | string | No | — | Nombre de la tabla para INSERT/UPDATE/DELETE. |
| `progid` | string | No | — | Identificador del objeto de negocio. **Opcional**: sin él la coll es un objeto de datos genérico (≡ `ASData.CASBasicDataObj`). Solo casos especiales: `ASGestion.CASEmpresa` (Empresas), `ASGestion.CASUser` (Usuarios). |
| `connection` | string | No | conexión por defecto | Nombre de la conexión en `<connection>`. |
| `filter` | string | No | `""` | Filtro SQL adicional (cláusula WHERE). |
| `sort` | string | No | `""` | Orden de datos (cláusula ORDER BY). |
| `loadall` | bool | No | `false` | Carga todos los registros al inicializar. |
| `volatile` | bool | No | `false` | No cachea objetos; siempre relee de BD. |
| `stringkey` | bool | No | `false` | La PK es de tipo string. |
| `threshold` | int | No | `200` | Tamaño máximo de la caché LRU de objetos. |
| `userawsql` | bool | No | `false` | No reescribe el SQL (lo usa tal cual). |
| `idfieldname` | string | No | `ID` | Nombre del campo PK cuando no se llama `ID`. |
| `dependent` | bool | No | `false` | Indica si la colección depende de una colección padre. |
| `check-owner` | bool | No | `false` | Verifica que los registros pertenezcan al usuario/empresa actual. |
| `autorefresh` | bool | No | `false` | Refresca datos automáticamente al regresar de otra ventana. |
| `inherits` | string | No | `""` | Nombre de coll de la que se hereda estructura visual. |

### 1.2 Atributos de UI/celda en listas

| Atributo | Tipo | Default | Descripción |
|---|---|---|---|
| `cell-width` | medida | auto | Ancho fijo de celda en grid. |
| `cell-height` | medida | auto | Alto fijo de celda en grid. |
| `cell-bgcolor` | color | heredado | Color de fondo de celda. |
| `cell-bgcolor_out` | color | heredado | Color de fondo fuera del viewport. |
| `cell-forecolor` | color | heredado | Color de texto de celda. |
| `cell-forecolor_out` | color | heredado | Color texto fuera del viewport. |
| `cell-border-color` | color | — | Color del borde de celda. |
| `cell-border-width` | medida | `0` | Grosor del borde de celda. |
| `cell-even-color` | color | — | Color para filas pares (zebra). |
| `cell-odd-color` | color | — | Color para filas impares (zebra). |
| `cell-selected-bgcolor` | color | — | Fondo de celda seleccionada. |
| `cell-selected-forecolor` | color | — | Texto de celda seleccionada. |
| `cell-selected-border-color` | color | — | Borde de celda seleccionada. |
| `cell-selected-border-width` | medida | — | Grosor borde celda seleccionada. |
| `editinline-rows` | int | `1` | Filas visibles en edición inline. |
| `no-data-text` | string | `""` | Texto cuando no hay registros. |
| `start-from-bottom` | bool | `false` | Scroll anclado al final de la lista (chats). Declarable en la coll o en el content (`type="Z"`); el del content tiene preferencia. |
| `divider-height` | int | — | Alto (grosor) del separador entre ítems de la lista (`type="Z"`). En listas expandibles el default es `4`. |
| `divider-color` | color | — | Color del separador entre ítems de la lista (`type="Z"`). |
| `divider-background` | string | — | Imagen (ruta de recurso) usada como separador entre ítems; tiene prioridad sobre `divider-color`. |
| `page-limit-off` | bool | `false` | Desactiva la paginación automática. |

### 1.3 Atributos de pantalla y comportamiento

| Atributo | Tipo | Default | Descripción |
|---|---|---|---|
| `special` | bool | `false` | Coleccion de pantalla pura (sin datos). |
| `notab` | bool | `false` | No muestra pestanas aunque haya varios grupos. |
| `show-toolbar` | bool | `true` | Muestra la toolbar. |
| `fullscreen` | bool | `false` | Pantalla a fullscreen. |
| `secure-window` | bool | `false` | Bloquea capturas de pantalla del sistema. |
| `disable-keyguard` | bool | `false` | Desbloquea el teclado al mostrar la pantalla. |
| `keep-screen-on` | bool | `false` | Mantiene la pantalla encendida mientras esta visible. |
| `ignore-safe-area` | bool | `false` | Ignora la safe-area del sistema (notch, barra de navegación). |
| `load-imgbk` | bool | `false` | Carga la imagen de fondo durante la carga inicial. |
| `load-wait` | bool | `true` | Muestra el dialogo de espera durante la carga. |
| `show-async` | bool | `false` | Muestra la pantalla aunque aún estén cargando datos. |
| `fixed-group` | int | `-1` | ID de grupo siempre visible (header fijo). |
| `tab-height` | medida | auto | Alto de la barra de pestanas. |
| `tab-orientation` | enum | `top` | `top` o `bottom`. Posición de la barra de pestanas. |
| `toolbar-bgcolor` | color | — | Fondo de la toolbar. |
| `toolbar-forecolor` | color | — | Texto de la toolbar. |
| `window-keyboard-behaviour` | enum | `adjustResize` | Modo del teclado software: `adjustResize`, `adjustPan`, `adjustNothing`. |
| `screen-orientation` | enum | `sensor` | `portrait`, `landscape`, `reversePortrait`, `reverseLandscape`, `sensorPortrait`, `sensorLandscape`, `sensor`. |
| `resolution-width` | int | auto | Ancho lógico de diseño (el contenido se escala a este ancho). |
| `resolution-height` | int | auto | Alto lógico de diseño. |
| `remote-mapcoll` | string | `""` | Coleccion remota para uso con mapas. |
| `login-coll` | string | `""` | Marca esta coll como pantalla de login. |
| `logoff-coll` | string | `""` | Marca esta coll como pantalla de logoff. |
| `readonly` | bool | `false` | Toda la colección es de **solo lectura a nivel de persistencia**: ni INSERT ni UPDATE en BD. Útil para colls que solo muestran datos sin permitir grabar. No tiene efecto sobre la UI de los controles individuales (esa se controla con `locked` / `disableedit` en cada `<prop>`). |
| `class` | string | `""` | Clase CSS aplicada a la coleccion. |

### 1.4 Nodos especiales hijos de `<coll>`

| Nodo hijo | Descripción |
|---|---|
| `<create>` | Script ejecutado una sola vez al crear el objeto (primera apertura). |
| `<before-edit>` | Script al abrir para edición. **Usar para inicializar la pantalla.** |
| `<after-edit>` | Script tras entrar en modo edición. |
| `<load>` | Se dispara **por cada DataObject** al cargarse desde la BD (startBrowse/loadAll/`<contents>`/cargas individuales). **NO es evento de pantalla** y **NO recomendado** por impacto en rendimiento. |
| `<onchange>` | Script al cambiar el valor de un campo (necesita `<field name="CAMPO">`). |
| `<selecteditem>` | Script al pulsar un item de lista. |
| `<auto-selecteditem>` | Selecciona automáticamente un item al cargar. |
| `<onlongpressitem>` | Script al hacer long-press sobre un item. |
| `<onback>` | Script al pulsar el botón atrás. |
| `<macro>` | Declara una macro de coleccion (ver sección 6). |
| `<contents>` | Coleccion anidada embebida. |
| `<permissions>` | Permisos del sistema requeridos. |
| `<platform>` | Override de atributos por plataforma (ver sección 10). |

```xml
<coll name="MiPantalla" title="Mi Pantalla" special="true" notab="true"
      show-toolbar="false" keep-screen-on="true" screen-orientation="portrait">
    <before-edit refresh="false" show-wait-dialog="false">
        <action name="runscript">
            <script language="javascript">inicializar();</script>
        </action>
    </before-edit>
    <group name="grpMain" id="1">
        <!-- ... -->
    </group>
</coll>
```

---

## 2. Nodo `<group>` — Grupo

Agrupa propiedades en una pestana o sección lógica dentro de una coleccion.

| Atributo | Tipo | Obligatorio | Default | Descripción |
|---|---|---|---|---|
| `name` | string | **Si** | — | Nombre único del grupo dentro de la coll. |
| `id` | int/string | **Si** | — | Identificador numérico **único dentro de la coll**. Si dos `<group>` comparten `id` en la misma coll el comportamiento es indefinido. Convencion: `1, 2, ...` normales; `999` HEADER fijo, `0` FOOTER fijo. |
| `title` | string | No | `id` | Título visible de la pestana. |
| `visible` | int (mask) | No | `-1` | Mascara binaria de visibilidad (misma lógica que `<prop>`). |
| `disableedit` | formula | No | `""` | Si la fórmula es verdadera, todos los controles del grupo quedan bloqueados para edición en la **UI** (equivalente a aplicar `locked="true"` a todos los `<prop>` del grupo). No afecta a la persistencia. |
| `disablevisible` | formula | No | `""` | Si la formula es verdadera, el grupo se oculta. |
| `fixed` | bool | No | `false` | Grupo fijo: no scrollea con el contenido. |
| `cache-groups` | bool | No | `false` | Cachea el contenido renderizado del grupo para mejorar rendimiento. |
| `drawer-orientation` | enum | No | `left` | `left` o `right`. Lado por el que aparece el drawer lateral. |
| `tab-theme` | string | No | tema actual | Tema visual de las pestanas. |
| `tab-width` | medida | No | auto | Ancho de cada pestana. |
| `group-theme` | string | No | tema actual | Tema visual del grupo. |
| `group-swipe` | bool | No | `true` | Permite cambiar de grupo deslizando horizontalmente. |
| `page-limit-off` | bool | No | `false` | Desactiva el limite de paginación visual del grupo. |
| `page-margin` | medida | No | `10dp` | Margen entre páginas al paginar. |
| `float-over-drawer` | bool | No | `false` | Los elementos flotantes se muestran sobre el drawer. |
| `bgcolor` | color | No | heredado | Color de fondo del grupo. |
| `forecolor` / `fgcolor` | color | No | heredado | Color de texto del grupo. |
| `class` | string | No | `""` | Clase CSS. |

```xml
<group name="grpPrincipal" id="1" group-swipe="true" tab-orientation="bottom">
    <!-- frames y props aquí -->
</group>
```

---

## 3. Nodo `<frame>` — Frame/Contenedor

Contenedor visual dentro de un grupo. Puede anidarse.

### 3.1 Identidad y posicionamiento

| Atributo | Tipo | Obligatorio | Default | Descripción |
|---|---|---|---|---|
| `name` | string | **Si** | — | Nombre único del frame dentro de la coll. |
| `group` | int | **Si** | — | ID del grupo al que pertenece. |
| `frame` | string | No | `""` | Nombre del frame padre (anidado). |
| `title` | string | No | `""` | Título mostrado en la cabecera del frame (si aplica). |
| `floating` | bool | No | `false` | Posicionamiento absoluto (saca el frame del flujo normal). |
| `top` / `left` / `right` / `bottom` | medida | No | — | Posición absoluta. Solo con `floating="true"`. |
| `width` / `height` | medida | No | auto | Tamaño explicito. `-1` = ocupar todo el espacio restante. `-2` = igual que `-1` pero con scroll. |
| `min-width` / `max-width` / `min-height` / `max-height` | medida | No | — | Restricciones de tamaño. |
| `newline` | bool | No | `true` | Salto de linea antes del frame. |
| `zorder` | int | No | `0` | Orden Z (profundidad) del frame. |

### 3.2 Comportamiento y scroll

| Atributo | Tipo | Default | Descripción |
|---|---|---|---|
| `scroll` | bool | `false` | Activa scroll interno en el frame. |
| `modal` | bool | `false` | Frame modal (bloquea interaccion con el resto). |
| `disableedit` | formula | `""` | Si verdadero, deshabilita el frame y todos sus hijos. |
| `disablevisible` | formula | `""` | Si verdadero, oculta el frame. |
| `ignore-touch-on-transparent-area` | bool | `false` | Los toques sobre áreas transparentes pasan al elemento del fondo. |
| `blend-bgcolor-with-image` | bool | `false` | Mezcla el color de fondo con la imagen de fondo. |

### 3.3 Drag & Drop

| Atributo | Tipo | Default | Descripción |
|---|---|---|---|
| `drag-enable` | bool | `false` | El frame es arrastrable. |
| `drag-area` | string | `""` | Nombre del hijo que actua como manija de arrastre. |
| `drag-opaque` | bool | `false` | El frame es opaco durante el arrastre. |
| `drop-target` | bool | `false` | Este frame acepta elementos soltados (drop). |
| `dropcoll` | string | `""` | Coleccion destino al soltar un elemento. |
| `notify-only-when-dropped` | bool | `false` | Solo dispara el evento al soltar (no durante el arrastre). |

### 3.4 Apariencia

| Atributo | Tipo | Default | Descripción |
|---|---|---|---|
| `bgcolor` | color | heredado | Color de fondo del frame. |
| `forecolor` | color | heredado | Color de texto del frame. |
| `border` | int (mask) | `0` | Bordes activos: top=1, right=2, bottom=4, left=8. Sumar para combinar. |
| `border-color` | color | — | Color del borde. |
| `border-width` | medida | `0` | Grosor del borde. |
| `border-corner-radius` | medida | `0` | Radio de esquinas redondeadas. |
| `tmargin` / `bmargin` / `lmargin` / `rmargin` | medida | `0` | Margenes externos. |
| `tpadding` / `bpadding` / `lpadding` / `rpadding` | medida | `0` | Padding interno. |
| `class` | string | `""` | Clase CSS. |
| `imgbk` | string | `""` | Imagen de fondo del frame. |

```xml
<frame name="frmHeader" group="1" width="100%" height="140p"
       bgcolor="#1565C0" lpadding="15p" rpadding="15p">
    <!-- props aquí -->
</frame>

<!-- Frame flotante (overlay) -->
<frame name="frmOverlay" group="1" floating="true"
       top="50p" left="10%" width="80%" height="200p"
       bgcolor="#FFFFFF" border-corner-radius="12" zorder="10">
</frame>
```

