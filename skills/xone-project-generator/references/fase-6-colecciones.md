# Generación XOne — Fase 6: generación de colecciones

> Fuente: `xone/v2/xone-project-generator/references/xone-project-generation-workflow.md` §7. Referencia de la skill; el índice está en [../SKILL.md](../SKILL.md).

Contenido: §7 nomenclatura, cuándo usar el prefijo MAP_, plantillas de colección, atributos de coll y prop, herencia inherits e include-layout, contents, campos por tipo de dato, relaciones y modos de edición

---

## 7. Fase 6: Generación de Colecciones

### 6.1 Objetivo

Crear un archivo `.xne` independiente por cada coleccion adicional del proyecto (todas excepto Empresas y Usuarios que van en `mappings.xne`).

### 6.2 Nomenclatura y Convenciones

- Nombre del archivo: `[NombreColeccion].xne` (PascalCase)
- Nombre de la coleccion (`name`): Mismo nombre que el archivo sin extensión
- Ejemplo: `Productos.xne` contiene `<coll name="Productos" ...>`

**Convenciones de nomenclatura de campos (name del prop):**

| Prefijo | Cuando usarlo | Ejemplo |
|---------|---------------|---------|
| Sin prefijo | Campos propios de la tabla, se graban en BD | `NOMBRE`, `FECHA`, `ESTADO` |
| `MAP_` | Valor NO es columna de la tabla `objname` (JOIN, `linkedto`, o prop puramente visual: L/TL, B, calculado, UI-state). No se graba en BD | `MAP_NOMBRECLIENTE`, `MAP_TIPO_DESC`, `MAP_TITULO`, `MAP_BTN_GUARDAR`, `MAP_TOTAL` |
| `@` | Campos tipo `Z` (contents embebidos) | `@LineasPedido` |
| `$` | Campos calculados (formula) | `$IMPORTE_TOTAL` |
| `%` | Campos tipo NC usados como bitmask | `%OPCIONES` |

### 6.2b Cuando usar el prefijo `MAP_`

El prefijo `MAP_` es una **señal al framework** que dice: *"este prop NO es una columna de la tabla apuntada por `objname`, no intentes persistirlo"*. Cuando el framework genera los `INSERT`/`UPDATE`, **excluye automáticamente** todos los props con prefijo `MAP_`. Por eso, **`MAP_loquesea` no existe ni debe existir como columna en la base de datos**.

#### Regla de oro

> **Si el valor del prop NO proviene de una columna de la tabla de `objname`, su `name` debe empezar por `MAP_`.**

#### Los tres casos en los que se usa `MAP_`

**Caso 1 — Campos que vienen de un JOIN en el SQL de la coll**

El SQL hace `LEFT JOIN` a otra tabla y trae descripciones. Los alias llevan `MAP_`:

```xml
<coll name="Pedidos"
      sql="SELECT t1.*,
           c.NOMBRE AS MAP_NOMBRECLIENTE,
           c.TELEFONO AS MAP_TELEFONOCLIENTE
           FROM ##PREF##Pedidos t1
           LEFT OUTER JOIN ##PREF##Clientes c ON t1.IDCLIENTE=c.ID"
      objname="pedidos" updateobj="pedidos" ...>
    <group name="General" id="1">
        <!-- FK: SI es columna de Pedidos, sin MAP_ -->
        <prop name="IDCLIENTE" type="N" visible="7" mapcol="Clientes" mapfld="ID" />

        <!-- Campos del JOIN: NO son columnas de Pedidos, con MAP_ -->
        <prop name="MAP_NOMBRECLIENTE"   type="T" visible="7" locked="true" fieldsize="150" />
        <prop name="MAP_TELEFONOCLIENTE" type="T" visible="7" locked="true" fieldsize="20" />
    </group>
</coll>
```

**Caso 2 — Campos enlazados via `linkedto` (combos/lookups)**

El combo usa dos props. El oculto con el ID es columna de la tabla (sin `MAP_`); el visible con la descripción obtenida del lookup lleva `MAP_`:

```xml
<!-- Oculto: FK, SI es columna -->
<prop name="IDTIPO" type="N" visible="0" mapcol="TiposProducto" mapfld="ID" />

<!-- Visible: descripción del lookup, NO es columna -->
<prop name="MAP_TIPO_DESC" type="T" visible="1"
      title="Tipo"
      linkedto="IDTIPO" linkedfield="DESCRIPCION" showinline="true" />
```

En combos con `mapcol-values` (valores inline en XML) el prop oculto también lleva `MAP_` porque no existe tabla de la que leer:

```xml
<prop name="MAP_IDTIPO" type="T" visible="0"
      mapcol-values="CC,TI,CE,Otro" mapfld="DATA" />
<prop name="MAP_TIPO" type="T" visible="1"
      linkedto="MAP_IDTIPO" linkedfield="DATA" showinline="true" />
```

**Caso 3 — Props puramente visuales (sin origen de datos)**

Cualquier prop sin dato persistible lleva `MAP_`:

| Uso | Tipo | Ejemplo |
|-----|------|---------|
| Etiquetas / títulos | `L` (alias legacy: `TL`) | `MAP_TITULO`, `MAP_SUBTITULO` |
| Botones | `B` | `MAP_BTN_GUARDAR`, `MAP_BTN_CANCELAR` |
| Imágenes decorativas | `IMG` | `MAP_LOGO`, `MAP_ICONO_CABECERA` |
| Contenedores de contents | `Z` | `MAP_LISTA_PRODUCTOS` |
| Valores calculados en runtime | `N2`, `F` | `MAP_TOTAL`, `MAP_SUBTOTAL_IVA` |
| Estados de UI | `T`, `N`, `NC` | `MAP_TAB`, `MAP_MODO`, `MAP_SELECCIONADO` |
| Buscadores / filtros temporales | `T` | `MAP_BUSQUEDA`, `MAP_FILTRO` |
| Callbacks / objetos JS | `O` | `MAP_CALLBACK` |

```xml
<prop name="MAP_TITULO"      type="L" title="Gestion de Pedidos" class="textoTitulo" />
<prop name="MAP_BTN_GUARDAR" type="B"  visible="1" title="Guardar" method="executenode(guardar)" />
<prop name="MAP_TOTAL"       type="N2" visible="1" locked="true" title="Total" />
<prop name="MAP_BUSQUEDA"    type="T"  visible="1" title="Buscar" onchange="Refresh" />
```

#### Mecanismo y consecuencias

- Los `MAP_*` **no se persisten**: el framework los excluye del SQL generado. Viven en memoria del DataObject durante la vida de la pantalla.
- Se leen y escriben desde JS como cualquier otro campo: `self.MAP_CAMPO`, `self["MAP_CAMPO"]`, `self.getValue("MAP_CAMPO")`.
- Pueden ser referenciados en `disablevisible`, en macros (`##FLD_MAP_xxx##`), en `ui.refresh("MAP_xxx")`, en `<action name="setval" field="MAP_xxx">`, etc.
- **No son de solo lectura.** `locked="true"` es una decisión de UI independiente del prefijo.

#### Anti-patrones

| Error | Consecuencia |
|-------|--------------|
| Poner `MAP_` a un campo que SI esta en BD | El dato no se persiste: se pierde al guardar |
| Omitir `MAP_` en un alias de JOIN | El framework genera UPDATE sobre columna inexistente -> error SQL |
| Omitir `MAP_` en el prop visible de un combo con `linkedto` | El framework intenta persistir la descripción del lookup -> error SQL |
| Declarar columna `MAP_LOQUESEA` en el `CREATE TABLE` | Columna muerta: el framework nunca escribe en ella |
| Poner `MAP_` a una etiqueta `L`/`TL` que muestra un campo real de BD | La etiqueta no refleja el dato persistido; confusion semantica |

### 6.3 Plantilla Base para Coleccion de Datos

```xml
<?xml version="1.0" encoding="iso-8859-15"?>
<coll name="NombreColeccion"
      title="nombre coleccion"
      sql="SELECT t1.* FROM ##PREF##NombreColeccion t1"
      objname="NombreColeccion"
      updateobj="NombreColeccion"
      progid="ASData.CASBasicDataObj"
      loadall="true"
      notab="true"
      group-swipe="false">

    <!-- GRUPO 1 - Formulario de edicion -->
    <group name="General" id="1">
        <!-- ID siempre oculto -->
        <!-- Campos de datos propios -->
        <prop name="CODIGO" type="T" visible="7" fieldsize="20" />
        <prop name="NOMBRE" type="T" visible="7" fieldsize="150" />
        <prop name="DESCRIPCION" type="T" visible="7" fieldsize="500" lines="3" />
        <prop name="ACTIVO" type="NC" visible="7" />
        <prop name="FECHA_CREACION" type="DT" visible="0" />
    </group>

</coll>
```

### 6.4 Plantilla para Coleccion con Foreign Key y campos enlazados

```xml
<?xml version="1.0" encoding="iso-8859-15"?>
<coll name="Pedidos"
      title="el pedido"
      sql="SELECT t1.*,
           c.NOMBRE AS MAP_NOMBRECLIENTE,
           u.NOMBRE AS MAP_NOMBREUSUARIO
           FROM ##PREF##Pedidos t1
           LEFT OUTER JOIN ##PREF##Clientes c ON t1.IDCLIENTE=c.ID
           LEFT OUTER JOIN ##PREF##usuarios u ON t1.IDUSUARIO=u.ID"
      objname="pedidos"
      updateobj="pedidos"
      progid="ASData.CASBasicDataObj"
      loadall="true"
      filter="t1.IDEMPRESA=##ENTID##"
      sort="t1.FECHA DESC"
      notab="true"
      group-swipe="false">

    <group name="General" id="1">
        <!-- Foreign Keys (IDLOQUESEA — todo junto, en mayusculas) -->
        <prop name="IDCLIENTE" type="N" visible="7" mapcol="Clientes" mapfld="ID" />
        <prop name="IDUSUARIO" type="N" visible="7" mapcol="Usuarios" mapfld="ID" />
        <!-- Campos enlazados de otras tablas (prefijo MAP_, no se graban en BD) -->
        <prop name="MAP_NOMBRECLIENTE" type="T" visible="7" locked="true" fieldsize="150" />
        <prop name="MAP_NOMBREUSUARIO" type="T" visible="7" locked="true" fieldsize="100" />
        <!-- Campos propios -->
        <prop name="FECHA" type="DT" visible="7" />
        <prop name="ESTADO" type="T" visible="7" fieldsize="20" />
        <prop name="TOTAL" type="N2" visible="7" />
        <prop name="OBSERVACIONES" type="T" visible="7" fieldsize="500" lines="3" />
    </group>

    <!-- Evento create: inicializar valores al crear un objeto nuevo -->
    <create>
        <action name="setval" field="FECHA" value="##NOW##" />
        <action name="setval" field="IDEMPRESA" value="##ENTID##" />
        <action name="setval" field="ESTADO" value="PENDIENTE" />
    </create>

</coll>
```

### 6.5 Atributos del nodo `<coll>`

#### Obligatorios para colecciones de datos

| Atributo | Descripción |
|----------|-------------|
| `name` | Nombre único de la coleccion en toda la app |
| `sql` | Query SQL. Siempre con `##PREF##`. El campo `ID` de la tabla principal SIEMPRE debe estar en el SELECT |
| `objname` | Nombre de la tabla principal para lectura de datos |
| `updateobj` | Nombre de la tabla para escritura. Normalmente igual que `objname` |
| `progid` | Tipo de objeto de datos. **Opcional** (default = genérico). `ASData.CASBasicDataObj` para colecciones de negocio; `ASGestion.CASEmpresa`/`ASGestion.CASUser` solo en Empresas/Usuarios |

#### Atributos de comportamiento frecuentes

| Atributo | Descripción | Valor por defecto |
|----------|-------------|-------------------|
| `title` | Nombre descriptivo de la coleccion | — |
| `loadall` | `true` carga todos los registros de golpe / `false` carga bajo demanda (usar para listas grandes) | `false` |
| `filter` | Clausula WHERE del SQL (sin la palabra WHERE). Soporta macros como `##ENTID##`, `##USERID##` | — |
| `sort` | Clausula ORDER BY (sin ORDER BY). Ej: `FECHA DESC, NOMBRE ASC` | — |
| `notab` | `true` oculta las pestanas de grupos y usa toda la pantalla | `false` |
| `group-swipe` | `true` permite deslizar entre grupos con el dedo | `true` |
| `special` | `true` indica coleccion especial (pantallas de menu, entrada, login) — no tiene tabla en BD | `false` |
| `editmask` | Bitmask que controla modos de edición (0=todos, 2=solo lista, 8=readonly) | `0` |
| `readonly` | `true` la coleccion es solo lectura, no permite modificaciones | `false` |
| `dependent` | `true` la coleccion depende del objeto padre | `false` |
| `check-owner` | `true` verifica que el registro pertenece al usuario actual | `false` |
| `autorefresh` | `true` refresca los datos al volver de otra ventana si hubo cambios | `false` |
| `cell-even-color` | Color de filas pares en modo lista | — |
| `cell-odd-color` | Color de filas impares en modo lista | — |
| `cell-height` | Alto de cada fila en modo lista (en puntos `p`) | — |
| `userawsql` | `true` usa el SQL exactamente como esta escrito sin modificaciones del framework | `false` |
| `start-from-bottom` | `true` el scroll empieza desde el final y se ancla al último item. Útil para chats. Se puede declarar en la coll o en el content (`type="Z"`); el del content tiene preferencia | `false` |
| `no-data-text` | Texto a mostrar cuando la coleccion no tiene registros | `" "` |
| `cell-height` | Alto fijo de cada fila en modo listado (en puntos `p`) | — |
| `cell-tpadding` | Margen interior superior de cada celda | — |
| `cell-bpadding` | Margen interior inferior de cada celda | — |
| `cell-bgcolor` | Color de fondo general de todas las celdas | — |
| `stringkey` | `true` indica que la clave primaria es de tipo texto en lugar de entero | `false` |
| `idfieldname` | Nombre del campo clave primaria cuando no se llama `ID` | `"ID"` |
| `group-theme` | `"material"` activa el estilo Material Design en las pestanas | — |
| `tab-mode` | `"fixed"` (pestanas fijas) o `"scrollable"` (pestanas con scroll) | — |
| `page-limit-off` | Limita el número de pestanas precargadas en memoria (por defecto 6) | `6` |

### 6.5b Herencia entre colecciones (`inherits`) y composición (`<include-layout>`)

XOne soporta dos mecanismos para reutilizar estructura XML entre colecciones. Son ortogonales al CSS `extends` — operan sobre groups, frames, props y eventos.

#### Atributo `inherits` en `<coll>`

Permite que una coll herede la estructura completa (grupos, frames, props y eventos) de otra coll declarada en el proyecto. Regla de precedencia: ante mismo `name`, **prevalece la hija**; los elementos no duplicados del padre se conservan.

```xml
<coll name="PantallaConcreta" inherits="groupsFixed" special="true" notab="false">
    ...
</coll>
```

**Reglas operativas:**
- Un solo padre por coll. No existe `inherits="A,B"`.
- Admite cadenas (A → B → C) — la resolución recorre toda la cadena aplicando hijo-gana en cada nivel.
- Los eventos duplicados también siguen hijo-gana (no hay `super()`).
- El padre puede estar en el mismo fichero `.xne` o en otro fichero `.xne` del proyecto; basta con referenciarlo por su `name`.

#### Patron recomendado: scaffolding visual compartido

Cuando el proyecto tiene varias pantallas con el mismo esqueleto (header fijo, footer de paginación, botones comunes, evento `<onback>` común), se crea una coll base `special="true"` que contenga ese scaffolding, y cada pantalla la hereda.

**Paso 1 — Crear la coll base** (fichero `layoutsFijos.xne` o similar):

```xml
<?xml version="1.0" encoding="iso-8859-15"?>
<coll name="layoutsFijos" title="" special="true">
    <!-- Header comun: logo, título, botón salir -->
    <group name="HEADER" id="999" class="groupfixed_header">
        <frame name="frmTitulo" class="frmsuperior">
            <prop name="BTSALIR" type="B" class="btvolversuper"
                  method="ExecuteNode(onback)" />
            <prop name="LBL_TITULO" type="L" class="tlsuper" title="App" />
        </frame>
    </group>
    <!-- Footer comun: paginador -->
    <group name="FOOTER" id="0" class="groupfixed_footer">
        <prop name="MAP_GROUP" type="N" visible="0" />
        <prop name="MAP_TOTAL_PAGES" type="N" visible="0" />
    </group>
    <!-- Evento de salida comun -->
    <onback show-wait-dialog="false">
        <action name="runscript">
            <script language="javascript">
                ui.getView(self).exit();
            </script>
        </action>
    </onback>
</coll>
```

**Paso 2 — Las pantallas concretas la heredan:**

```xml
<?xml version="1.0" encoding="iso-8859-15"?>
<coll name="PantallaA" inherits="layoutsFijos" special="true" notab="false">
    <!-- Solo sobreescribe el título del header -->
    <group name="HEADER" id="999">
        <frame name="frmTitulo" class="frmsuperior">
            <prop name="LBL_TITULO" type="L" class="tlsuper" title="Pantalla A" />
        </frame>
    </group>
    <!-- Contenido propio -->
    <group name="Group1" id="1">
        <prop name="MAP_CAMPO1" type="T" visible="1" />
    </group>
    <before-edit>
        <action name="runscript">
            <script language="javascript">
                self.MAP_GROUP = 1;
                self.MAP_TOTAL_PAGES = 1;
            </script>
        </action>
    </before-edit>
</coll>
```

**Decisión: cuando SI y cuando NO usar `inherits`**

| Escenario | Decisión |
|-----------|----------|
| 3+ pantallas con mismo header/footer/navegación | SI — extraer a coll base `special="true"` |
| 2 pantallas con estructura muy parecida y lógica distinta | SI — coll base común, override de eventos en la hija |
| 1-2 pantallas con algunas piezas comunes | Normalmente NO — duplicar es más claro |
| Colecciones de datos (con `objname`) | Raro — `inherits` es útil sobre todo entre colecciones `special="true"` |
| Pantallas con estructura totalmente distinta | NO — la herencia no aporta |

#### Nodo `<include-layout>` (composición por fragmentos)

Nodo hijo de `<coll>` que inyecta el contenido de un fichero XML externo. Útil para factorizar **botoneras, bloques de props recurrentes o eventos compartidos**.

```xml
<include-layout file="misBotones.xml" group="1" frame="todo" />
```

- `file`: ruta **relativa a la raiz del proyecto**
- `group`/`frame`: defaults para props del fichero incluido que no los declaren

**Formato del fichero incluido:**

```xml
<?xml version="1.0" encoding="utf-8"?>
<xml>
    <!-- Props, groups, frames y eventos al mismo nivel (plano) -->
    <prop name="MAP_SALIR" type="B" title="Salir" visible="1"
          method="ExecuteNode(salir)" width="100%" labelwidth="10" />
    <salir refresh="false">
        <action name="runscript">
            <script language="javascript">
                appData.exit();
            </script>
        </action>
    </salir>
</xml>
```

**Reglas clave:**
- Encoding del fichero incluido: **`utf-8`** (los `.xne` pueden ir en UTF-8 o iso-8859-15).
- Raiz: `<xml>` (NO `<coll>`).
- Estructura plana, no jerárquica.
- **No se pueden anidar `<include-layout>`**: el fichero incluido no puede contener a su vez otro `<include-layout>`.
- Los nombres (`name`) deben ser únicos en el ambito final tras la composición.

#### Checklist para el agente

- [ ] Si 3+ pantallas comparten estructura, extraer a coll base `special="true"` y usar `inherits`.
- [ ] La coll base va en su propio fichero `.xne` (PascalCase: `LayoutsFijos.xne`).
- [ ] Recordar: `inherits` admite cadena A→B→C pero NO herencia multiple.
- [ ] Si hay botoneras o bloques repetidos entre colls heredadas y no heredadas, factorizar con `<include-layout>` a fichero externo.
- [ ] En el fichero de `<include-layout>`: encoding `utf-8`, raiz `<xml>`, estructura plana, sin anidar otros `<include-layout>`.
- [ ] Nombres únicos en el ambito final tras herencia + composición.

### 6.6 Nodo `<contents>` — Coleccion embebida

Para mostrar una relación 1-N dentro de una coleccion, se usa un `prop type="Z"` con su `<contents>` asociado:

```xml
<!-- Dentro del group, el prop que muestra el contents -->
<prop name="@LineasPedido" type="Z" visible="1"
      contents="LineasPedido"
      width="100%" height="60%"
      locked="true" />

<!-- El nodo contents define el origen de datos del Z -->
<contents name="LineasPedido" src="ColeccionLineasPedido"
          filter="IDPEDIDO=##FLD_ID##" />
```

> El `filter` del `<contents>` usa `##FLD_CAMPO##` para referenciar campos del objeto padre.

### 6.7 Atributos de `<prop>` — Referencia de los más importantes

| Atributo | Descripción |
|----------|-------------|
| `name` | Nombre del campo. **SIEMPRE EN MAYUSCULAS** |
| `type` | Tipo del campo (ver sección 3.3) |
| `visible` | Bitmask de visibilidad. Estático — no cambia en tiempo de ejecución. Valores: 0=oculto, 1=edición, 2=lista, 3=edición+lista, 4=content, 7=edición+lista+content, 8=combo, 15=todos (ver sección 3.4) |
| `title` | Etiqueta/label a mostrar junto al campo |
| `width` | Ancho. Usar `%` o `p` (puntos). Ej: `"90%"`, `"200p"` |
| `height` | Alto. Usar `%` o `p`. Valor especial `-2` = altura automática según contenido |
| `fieldsize` | Tamaño máximo del campo de texto en BD |
| `size` | Tamaño visual del campo |
| `lines` | Número de lineas para campos de texto multilínea |
| `fixed-lines` | `true` el campo ocupa exactamente las lineas indicadas en `lines` |
| `newline` | Por defecto `true` — cada elemento ocupa su propia línea. Con `false` el elemento se coloca a la derecha del anterior. Funciona igual en `<frame>` y `<prop>`. Los anchos de los elementos en la misma fila deben sumar 100% o menos |
| `locked` | `true` el campo es solo lectura para el usuario |
| `labelwidth` | Proporcion de la etiqueta. `0` = sin etiqueta, solo el valor |
| `forecolor` | Color del texto de la etiqueta |
| `bgcolor` | Color de fondo del campo |
| `fontsize` | Tamaño de la fuente de la etiqueta |
| `textfont-size` | Tamaño de la fuente del valor del campo |
| `textfont-bold` | `true` el valor del campo en negrita |
| `text-forecolor` | Color del texto del valor del campo |
| `text-bgcolor` | Color de fondo del área de texto del campo |
| `text-align` | Alineacion del texto: `left`, `center`, `right`, `left\|center` |
| `text-border` | `true/false` borde alrededor del área de texto |
| `text-border-bottom` | `true/false` solo borde inferior |
| `lmargin` / `tmargin` / `rmargin` / `bmargin` | Margenes exteriores |
| `lpadding` / `tpadding` / `rpadding` / `bpadding` | Margenes interiores |
| `align` | Posición del elemento dentro de su contenedor (`<group>`, `<frame>` o `<prop>`). Mismo comportamiento en los tres nodos. Valores: `left`, `right`, `center`, `top`, `bottom` y combinaciones con `\|` como `center\|center`, `left\|top`, `left\|center`, `center\|top`. Ver tabla completa en 02-xml-ui-complete-guide sección 4.2 |
| `disablevisible` | Oculta el elemento en tiempo de ejecución si se cumple la condición. Aplica en `<group>`, `<frame>` y `<prop>`. Se reevalua al hacer `ui.refresh()` o cuando el campo referenciado tiene `onchange="refresh"`. Formato: `CAMPO=VALOR`, `CAMPO>VALOR`, `CAMPO<VALOR` |
| `disableedit` | **Bloquea edición del campo SI se cumple la condición**. Ej: `"ESTADO=2"` |
| `mapcol` | Coleccion a la que enlaza este campo (FK) |
| `mapfld` | Campo de la coleccion enlazada que devuelve el valor |
| `linkedto` | Campo de esta coleccion donde se guarda el valor seleccionado del enlace |
| `linkedfield` | Campo de la coleccion enlazada que se muestra al usuario |
| `showinline` | `true` abre las opciones del selector en un panel inferior |
| `showinline-keyboard` | `true` añade una caja de búsqueda en la cabecera del panel `showinline` para filtrar las opciones |
| `bgcolor-dialog` / `forecolor-dialog` / `fontsize-dialog` | Personalizan el panel `showinline` y los pickers `D`/`DT`/`TT`: fondo, color de texto/acento y tamaño |
| `floating-tooltip` | `true` muestra el `tooltip` como placeholder flotante sobre el campo |
| `tooltip` | Texto de ayuda o placeholder del campo |
| `method` | Método XOne a ejecutar al pulsar. Ej: `"ExecuteNode(guardar)"` |
| `onclick` | Script JavaScript inline al pulsar. Ej: `"javascript:miFuncion();"` |
| `onchange` | Acción al cambiar el valor. Ej: `"Refresh"` o `"javascript:calcular();"` |
| `img` | Imagen para botones (`type="B"`) |
| `imgsel` | Imagen al pulsar el botón |
| `keep-aspect-ratio` | `true` mantiene proporcion al redimensionar imágenes |
| `error-image` | Imagen alternativa si la principal falla. Ej: `error-image="avatar_error.png"` |
| `repeat-mode` | **Solo animaciones Lottie en `type="IMG"`**: `restart` (defecto, vuelve a empezar) o `reverse` (ida y vuelta). La animación arranca sola en bucle infinito |
| `clip-text-to-bounds` | **Solo animaciones Lottie en `type="IMG"`**: recorta el texto de párrafo a la caja definida en el diseño (defecto `false`) |
| `use-internal-camera` | `true` captura con la cámara que trae el framework en vez de abrir la app de cámara del dispositivo |
| `motion-photo` | `true` captura una foto en movimiento: JPG con un clip de vídeo corto embebido. Requiere `use-internal-camera="true"` e ignora los atributos `file-*` |
| `contents` | Nombre del contents asociado (para `type="Z"`) |
| `viewmode` | Modo de visualizacion del contents (ver sección 7.13) |
| `group` | ID del grupo al que pertenece este prop (forma alternativa de asignacion) |
| `info` | Metadato informativo sin efecto visual. Útil para documentar campos |
| `fixed-text` | `true` combinado con `size` impide introducir más caracteres del limite en UI |
| `floating` | `true` el prop se superpone al layout. Posicionar con `top` y `left` |
| `keep-aspect-ratio` | Ya documentado: `true` mantiene la proporcion original de la imagen |
| `updates` | Al cambiar este campo, propaga el cambio al campo indicado en la coleccion contents |
| `contextual-search` | `true` activa la busqueda en tiempo real sobre un contents |
| `contextual-target` | Nombre del `type="Z"` que se filtra con la busqueda contextual |
| `contextual-filter` | Clausula WHERE para el filtro contextual. `##VAL##` se sustituye por el texto escrito |
| `formula` | Calcula el valor con una SQL externa. Formato: `ext.[NOMBRE]`. Requiere nodo `<ext-formula>` |

### 6.8 Regla de Campos por Tipo de Dato

| Tipo de Campo | Atributo `fieldsize` | Notas |
|---------------|----------------------|-------|
| Texto corto (T) | `fieldsize="20"` a `"50"` | Códigos, estados, telefonos |
| Texto medio (T) | `fieldsize="100"` a `"150"` | Nombres, emails, títulos |
| Texto largo (T) | `fieldsize="255"` a `"500"` | Descripciones, direcciones, observaciones |
| Password (X) | `fieldsize="100"` | Siempre `visible="0"` |
| Numéricos (N, N2...) | No requiere fieldsize | IDs, cantidades, precios |
| Fechas (D, DT) | No requiere fieldsize | Fechas y timestamps |
| Booleanos (NC) | No requiere fieldsize | Flags 0/1 |
| ID campos FK | No requiere fieldsize | Convenir `IDLOQUESEA` todo junto en mayusculas |

---

### 6.8b Atributos especiales por tipo

**Radio button (type="NC" con check-type="radio"):**

```xml
<prop name="MAP_OPCION_A" type="NC" visible="1"
      title="Opción A" check-type="radio" radio-group="1"
      width="100%" height="120p" />
<prop name="MAP_OPCION_B" type="NC" visible="1"
      title="Opción B" check-type="radio" radio-group="1"
      width="100%" height="120p" />
<prop name="MAP_OPCION_C" type="NC" visible="1"
      title="Opción C" check-type="radio" radio-group="1"
      width="100%" height="120p" />
```

| Atributo | Descripción |
|----------|-------------|
| `check-type="radio"` | Convierte el NC en radio button en lugar de checkbox |
| `radio-group` | ID numérico del grupo. Solo puede estar activo uno del mismo grupo |
| `allow-radio-group-uncheck` | `true` permite deseleccionar el radio pulsandolo de nuevo |

**onchange — refresco al cambiar valor:**

```xml
<!-- Refrescar toda la pantalla al cambiar -->
<prop name="ESTADO" type="N" visible="1" onchange="refresh" />

<!-- Refrescar un prop específico -->
<prop name="TIPO" type="T" visible="1" onchange="refresh(MAP_SUBTIPO)" />

<!-- Ejecutar nodo custom -->
<prop name="IMPORTE" type="N2" visible="1" onchange="ExecuteNode(calcularTotal)" />
```

**Animación Lottie (type="IMG"):**

Un `IMG` cuyo fichero sea `.json`, `.lottie` o `.tgs` se renderiza como animación Lottie y **arranca sola en bucle infinito**, sin llamar a nada. El atributo `path` (igual que `img`) acepta además PNG, JPG, SVG (renderizado nativo, sin `type="WEB"`) y GIF animado; el formato se decide por la extensión del fichero.

```xml
<!-- Animación de carga, ida y vuelta -->
<prop name="MAP_LOADER" type="IMG" visible="1"
      path="loader.json"
      labelwidth="0"
      width="120p" height="120p"
      repeat-mode="reverse" />
```

| Extensión | Qué es |
|-----------|--------|
| `.json` | La animación en texto plano; sus imágenes pueden ir embebidas dentro o aparte |
| `.lottie` | Paquete comprimido con la animación y sus imágenes |
| `.tgs` | Sticker de Telegram: un `.json` comprimido con gzip |

- **Fuentes:** si la animación lleva texto, la fuente se busca **solo** en `fonts/` con el nombre de familia que declara el fichero (una que pida `Roboto` necesita `fonts/Roboto.ttf` o `.otf`); si falta, se usa la del dispositivo.
- **Imágenes:** embebidas en el fichero, dentro del `.lottie`, o sueltas junto a él respetando la subcarpeta que declare el diseño (normalmente `images/`).
- **Control desde JavaScript:** `playAnimation(obj)`, `pauseAnimation()`, `resumeAnimation()`, `stopAnimation()` (además rebobina al primer frame), `setAnimationFrame(frame)`, `getMaxFrameCount()` sobre el control obtenido con `getControl(...)`.

`playAnimation(obj)` admite `{reverse, speed, repeatCount, repeatMode, fromFrame, toFrame}`. Ojo: como la animación ya se reproduce sola en bucle infinito, llamar a `playAnimation({...})` con `repeatCount: 0` (defecto) la corta tras **una sola pasada** — para mantener el bucle infinito usar `repeatCount: -1`. `speed` debe ser positivo; `repeatMode` es `"restart"` (defecto) o `"reverse"`; `toFrame: 0` significa "hasta el final".

```javascript
// Reproducir una vez, al doble de velocidad
getControl("MAP_LOADER").playAnimation({ speed: 2 });

// Volver a dejarla en bucle infinito, ida y vuelta
getControl("MAP_LOADER").playAnimation({ repeatCount: -1, repeatMode: "reverse" });
```

### 6.9 Relaciones entre Colecciones

XOne tiene tres tipos de relaciones entre colecciones:

| Tipo | Cuando usarlo |
|------|---------------|
| **1 a 1 — Lupa** | Relación con colecciones que tienen muchos datos. El usuario abre un buscador para seleccionar |
| **1 a 1 — Combo** | Relación con colecciones que tienen pocos datos. Se muestran como lista desplegable inline |
| **1 a 1 — Combo sin BD** | Valores fijos predefinidos en el propio XML, sin tabla auxiliar |
| **1 a N — Contents** | Relación maestro-detalle donde el número de registros es variable |

#### Relación 1 a 1: Lupa

El campo FK guarda el ID seleccionado. Campos `MAP_` adicionales muestran datos de la fila seleccionada sin grabarse en BD. La lupa aparece en el campo sin `locked="true"`.

```xml
<!-- Campo FK — se graba en BD, normalmente oculto -->
<prop name="IDCLIENTE" type="N" visible="0" mapcol="Clientes" mapfld="ID" />

<!-- Campo que muestra el valor — con lupa activa para buscar -->
<prop name="MAP_CLIENTE" type="T" visible="1"
      linkedto="IDCLIENTE" linkedfield="NOMBRE" onchange="Refresh" />

<!-- Campos adicionales de la misma fila — locked=true evita que salga la lupa -->
<prop name="MAP_TELEFONO" type="T" visible="1" locked="true"
      linkedto="IDCLIENTE" linkedfield="TELEFONO" onchange="Refresh" />
```

#### Relación 1 a 1: Combo (coleccion auxiliar)

Identica a la lupa pero con `showinline="true"`. Usar solo cuando la coleccion tiene pocos registros, ya que se carga completa en memoria al abrir la pantalla.

```xml
<!-- Campo FK — se graba en BD -->
<prop name="IDTIPO" type="N" visible="0" mapcol="TiposVisita" mapfld="ID" />

<!-- Campo combo — showinline="true" lo convierte en desplegable -->
<prop name="MAP_TIPO" type="T" visible="1"
      linkedto="IDTIPO" linkedfield="DESCRIPCION" showinline="true" />
```

#### Relación 1 a 1: Combo sin BD (valores fijos)

Cuando los valores son pocos y fijos. No necesita tabla auxiliar. El atributo `mapcol-values` define los valores separados por comas.

```xml
<!-- Campo con valores predefinidos — MAP_ porque no se graba directamente -->
<prop name="MAP_IDTIPO" type="N" visible="0"
      mapcol-values="COMERCIAL,TECNICO,ADMINISTRACION" />

<!-- Campo que se graba en BD — linkedfield siempre es DATA en este caso -->
<prop name="TIPO" type="T" visible="1"
      linkedto="MAP_IDTIPO" linkedfield="DATA" showinline="true" />
```

#### Relación 1 a N: Contents (maestro-detalle)

Para mostrar registros hijos dentro de un registro padre. La coleccion hija es independiente y se usa como contents filtrado por el ID del padre.

```xml
<!-- En la coleccion padre (Pedidos) -->
<prop name="@DETALLES" type="Z" visible="1"
      contents="Detalles" width="100%" height="60%" locked="true" />
<contents name="Detalles" src="ColDetalles"
          filter="IDPEDIDO=##ID##" />

<!-- Evento insert en el padre: enlaza los hijos al grabarse -->
<insert>
    <action name="link" coll="ColDetalles" field="IDPEDIDO" value="##ID##" />
</insert>

<!-- Evento delete en el padre: borra los hijos al borrar el padre -->
<delete>
    <action name="executesql"
            sql="DELETE FROM ##PREF##detalles WHERE IDPEDIDO=##ID##" />
</delete>
```

```xml
<!-- Coleccion hija (ColDetalles) — evento create: asigna el ID del padre al crearse -->
<create>
    <action name="setfldval" targetfld="IDPEDIDO" sourcefld="ID" />
</create>
```

> **REGLA:** Toda coleccion padre que tenga un `<contents>` debe tener un evento `<delete>` con `executesql` para borrar los registros hijos cuando se borre el padre.

#### Macro `##OWNERCOLL##` — Contents reutilizables

Cuando una misma coleccion hija puede usarse como contents para varias colecciones padre diferentes, se usa `##OWNERCOLL##` en el `mapcol` del campo FK de la coleccion hija. Sera sustituido automáticamente por el nombre de la coleccion padre que la use en cada caso.

```xml
<!-- Coleccion hija reutilizable -->
<coll name="Detalles" ...>
    <prop name="IDDOCUMENTO" type="N" visible="0"
          mapcol="##OWNERCOLL##" mapfld="ID" />
</coll>

<!-- Puede usarse desde Facturas Y desde Albaranes sin cambiar la definición -->
<coll name="Facturas" ...>
    <prop name="@DETALLES" type="Z" contents="Detalles" />
    <contents name="Detalles" src="Detalles" filter="IDDOCUMENTO=##ID##" />
</coll>

<coll name="Albaranes" ...>
    <prop name="@DETALLES" type="Z" contents="Detalles" />
    <contents name="Detalles" src="Detalles" filter="IDDOCUMENTO=##ID##" />
</coll>
```

---

### 6.10 Atributos del nodo `<contents>` y del `prop type="Z"`

#### Atributos del prop type="Z"

| Atributo | Descripción |
|----------|-------------|
| `contents` | Nombre del nodo `<contents>` asociado |
| `width` / `height` | Dimensiones del área del contents |
| `locked` | `true` impide la edición de registros |
| `edit-inrow` | `true` edita el registro en la misma fila del listado (por defecto `true`) |
| `editmodal` | `true` al hacer doble click abre el registro en una ventana separada |
| `forceonchange` | `true` fuerza el refresco al volver de la ventana de edición |
| `mask` | Bitmask de operaciones permitidas: 1=nuevo, 2=editar, 4=borrar, 8=filtro, 16=salir |
| `disableedit` | Deshabilita edición si se cumple la condición |
| `disablevisible` | Oculta el contents si se cumple la condición |
| `filter` | Filtro adicional aplicado al contents en tiempo de ejecución |
| `viewmode` | Modo de visualizacion (ver sección 7.13 para la lista completa) |

#### Atributos del nodo `<contents>`

| Atributo | Descripción |
|----------|-------------|
| `name` | Nombre del contents, debe coincidir con el atributo `contents` del prop Z |
| `src` | Nombre de la coleccion de datos que alimenta este contents |
| `filter` | Filtro de registros. Usar `##ID##` para el ID del objeto padre, `##FLD_CAMPO##` para campos del padre |
| `disableedit` | Deshabilita edición si se cumple la condición |
| `disablevisible` | Oculta el contents si se cumple la condición |
| `sort` | Ordenacion de los registros del contents |

---

### 6.11 Modos de Edición del Contents

#### Edición directa (por defecto)

Al tocar un elemento del contents, se abre el objeto en edición. Es el comportamiento por defecto.

```xml
<prop name="@content1" type="Z" contents="content1"
      height="96%" width="100%" bgcolor="#FFFFFF" />
<contents name="content1" src="MiColeccion" filter="IDPADRE=##ID##" />
```

#### Edición en la fila (`edit-inrow="true"`)

El registro se edita directamente en la misma fila del listado, sin abrir una ventana nueva.

```xml
<prop name="@content2" type="Z" contents="content2"
      edit-inrow="true" mask="0" height="75%" width="100%" />
<contents name="content2" src="MiColeccion" filter="IDPADRE=##ID##" />
```

#### Edición con `selecteditem`

Se programa lo que ocurre al seleccionar un elemento. Útil para lógica personalizada al seleccionar.

```xml
<!-- En la coleccion padre -->
<prop name="@content3" type="Z" contents="content3"
      disableedit="1=1" height="70%" width="100%" />
<contents name="content3" src="MiColeccion" filter="IDPADRE=##ID##" />

<!-- En la coleccion hija (MiColeccion) -->
<selecteditem refresh="false" show-wait-dialog="false">
    <action name="runscript">
        <script language="javascript">
            // self es el objeto seleccionado
            // getParent() devuelve el objeto padre
            self.getParent().MAP_SELECCIONADO = self.NOMBRE;
            ui.refresh("MAP_SELECCIONADO");
        </script>
    </action>
</selecteditem>
```

#### Filtro y multiseleccion

Para permitir filtrar el contents dinámicamente y seleccionar multiples registros:

```xml
<!-- Campo de texto para filtrar -->
<prop name="MAP_BUSCAR" type="T" visible="1" labelwidth="0"
      onchange="javascript:filtrarContent();" />

<!-- Contents con filtro dinámico usando ##FLD_MAP_BUSCAR## -->
<prop name="@contentFiltro" type="Z" contents="contentFiltro"
      edit-inrow="true" mask="0" forceonchange="true"
      onchange="Refresh" editmodal="true" />
<contents name="contentFiltro" src="MiColeccion"
          filter="NOMBRE LIKE ##FLD_MAP_BUSCAR##" />

<!-- En la coleccion hija: campo NC para multiseleccion -->
<prop name="MAP_SELECTED" type="NC" visible="4" labelwidth="0"
      width="10%" height="60p" newline="false" />
```

**JavaScript para recargar el contents al cambiar el filtro:**

```javascript
function filtrarContent() {
    var coll = self.getContents("contentFiltro");
    coll.clear();
    coll.loadAll();
    ui.refresh("@contentFiltro");
}
```

