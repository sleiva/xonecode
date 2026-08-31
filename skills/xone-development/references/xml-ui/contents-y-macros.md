# XOne XML — Nodo contents y macros

> Fuente: `xone/v2/xone-help-docs/topics/02c-xml-contents-patrones.md` §6–§7. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §6 contents: vinculación con type=Z, filtros dinámicos ##FLD_CAMPO##, asfilter · §7 macros: macros del sistema, setMacro/getMacro y declaración del nodo macro

---

## 6. Nodo contents - Contenido Embebido

### 6.1 Sintaxis y atributos

El nodo `<contents>` define una relación padre-hijo entre colecciones. Permite embeber una lista de registros dentro de otra pantalla.

```xml
<contents name="@NombreContent"
          src="NombreColeccionHija"
          filter="CAMPO=VALOR"
          sort="CAMPO ASC" />
```

| Atributo | Tipo | Requerido | Descripción |
|----------|------|-----------|-------------|
| `name` | string | **Si** | Nombre del content, con prefijo `@` |
| `src` | string | **Si** | Nombre de la coleccion fuente (la coleccion hija) |
| `filter` | string | No | Filtro SQL para los registros |
| `sort` | string | No | Ordenamiento de los registros |

### 6.2 Vinculacion con prop type=Z

Un `<contents>` por si solo no muestra nada. Necesita estar vinculado a un `<prop type="Z">`:

```xml
<!-- Prop que muestra la lista -->
<prop name="MAP_LISTA" type="Z" visible="1"
      contents="@MiContent"
      viewmode="recyclerview"
      width="100%" height="60%"
      edit-inrow="true" />

<!-- Contents que define la fuente de datos -->
<contents name="@MiContent" src="ColeccionHija" />
```

### 6.3 Patron maestro-detalle

El patron más común es mostrar una lista (maestro) donde cada item abre un detalle:

```xml
<coll name="ListaPedidos" notab="true"
      sql="SELECT * FROM ##PREF##Pedidos"
      objname="Pedidos" loadall="true">
    <group name="Lista" id="1">
        <!-- Campos visibles en la lista (visible="4" para content) -->
        <prop name="NUMERO" type="T" visible="4" />
        <prop name="FECHA" type="D" visible="4" />
        <prop name="TOTAL" type="N2" visible="4" />

        <!-- Campos visibles solo en edicion -->
        <prop name="CLIENTE" type="T" visible="1" title="Cliente" />
        <prop name="ESTADO" type="T" visible="1" title="Estado" />

        <!-- Lista de lineas del pedido -->
        <prop name="MAP_LINEAS" type="Z" visible="1"
              contents="@LineasPedido"
              viewmode="recyclerview"
              width="100%" height="300p"
              edit-inrow="true" />
    </group>

    <contents name="@LineasPedido" src="LineasPedido"
              filter="ID_PEDIDO=##FLD_ID##" />

    <selecteditem>
        <action name="runscript">
            <script>
                ui.openEditView(self);
            </script>
        </action>
    </selecteditem>
</coll>
```

### 6.4 Filtros dinámicos con ##FLD_CAMPO##

La macro `##FLD_CAMPO##` permite filtrar el content basandose en el valor de un campo del registro padre:

```xml
<!-- Filtra por el ID del registro actual -->
<contents name="@Detalles" src="Detalles"
          filter="ID_PADRE=##FLD_ID##" />

<!-- Filtro complejo con fecha -->
<contents name="Calendariodatos" src="ContentCalendarioLista"
          filter="strftime('%m',##FLD_MAP_FECHA##)=strftime('%m',FECHA)
                  and strftime('%Y',##FLD_MAP_FECHA##)=strftime('%Y',FECHA)" />

<!-- Filtro con campo de chat -->
<contents name="Chatear" src="Chatear"
          filter="IDCHAT=##FLD_MAP_CHATSEL##" />

<!-- Filtro con usuario actual -->
<contents name="nUsuarios" src="UsuariosChat"
          filter="ID<>##USERID##" />

<!-- Filtro complejo con multiples condiciones -->
<contents name="ContentDatosFiltroMultiseleccion"
          src="ContentDatosFiltroMultiseleccion"
          filter="((t1.MARCADO=1 AND 1=##FLD_MAP_BUSCAR_MARCADOS##)
                   OR (t1.MARCADO=0 AND 1=##FLD_MAP_BUSCAR_NOMARCADOS##))
                  AND (ifnull(t1.NOMBRE,'') LIKE ##FLD_MAP_BUSCAR_TEXT##)" />
```

### 6.5 Ejemplos reales

**Ejemplo de contents con edición directa** (del wiki, EspecialContents.xne):

```xml
<frame name="c1" width="98%" height="78%"
       framebox="true" border-corner-radius="10" lmargin="1%" tmargin="2%">
    <prop name="MAP_content1" height="96%" type="Z"
          contents="content1"
          forceonchange="true"
          bgcolor="#FFFFFF"
          onchange="refresh(@content1)" />
    <contents name="content1" src="ContentDatos" />
</frame>
```

**Ejemplo de contents con edición en fila**:

```xml
<frame name="c2" width="98%" height="75%"
       framebox="true" border-corner-radius="10" lmargin="1%" tmargin="2%">
    <prop name="@content2" height="96%" type="Z"
          contents="content2"
          mask="0"
          edit-inrow="true"
          bgcolor="#FFFFFF" />
    <contents name="content2" src="ContentDatosEditRow" />
</frame>
```

**Manipulación de contents desde JavaScript** (ver Tópico 03):

```javascript
// Obtener un content
var coll = self.getContents("content1");

// Crear un nuevo objeto
var obj = coll.createObject();
obj.NOMBRE = "Nuevo registro";
obj.DIRECCION = "Dirección nueva";

// Agregar a la lista (al final)
let view = ui.getView(self);
view.MAP_content1.addItem(obj);

// Agregar en una posicion concreta: 2o parametro opcional con el indice.
// Sincroniza lista y datos; el indice se acota al rango valido (negativo -> primer
// elemento; mayor que el total -> al final). Devuelve la vista de la fila insertada.
view.MAP_content1.addItem(obj, 0);   // insertar como primer elemento

// Filtrar un content
self.getContents("content4").setFilter("NOMBRE like '%texto%'");
self.getContents("content4").loadAll();
ui.getView(self).refresh("@content4");

// Ordenar un content
self.getContents("content4").sort = "NOMBRE ASC";
self.getContents("content4").loadAll();
```

### 6.6 Nodo asfilter - Filtros de Busqueda en Listas

El nodo `<asfilter>` define campos de busqueda que permiten al usuario filtrar los registros de una coleccion directamente desde la interfaz. Se declara como hijo directo de `<coll>` y genera automáticamente una barra de busqueda con los campos especificados.

```xml
<asfilter fontsize="8" left="12" sort="false">
    <field name="NUMCOMPLETO" fldname="NUMCOMPLETO"
           oper="##FLD## LIKE '##VAL##%'" width="15"
           tooltip="Albaran" newline="false">ALBARAN</field>
    <field name="FECHA" fldname="FECHA"
           oper="##FLD## >= '##VAL##'" width="10"
           tooltip="Fecha desde">FECHA DESDE</field>
</asfilter>
```

**Atributos de `<asfilter>`:**

| Atributo | Descripción |
|----------|-------------|
| `fontsize` | Tamaño de fuente de los campos del filtro |
| `left` | Margen izquierdo del panel de filtro |
| `sort` | Habilita ordenamiento en el filtro (`true`/`false`) |

**Atributos de `<field>` dentro de `<asfilter>`:**

| Atributo | Descripción |
|----------|-------------|
| `name` | Nombre del campo de filtro |
| `fldname` | Nombre del campo real en la tabla de base de datos |
| `oper` | Operador SQL. Usa `##FLD##` para el nombre del campo y `##VAL##` para el valor ingresado por el usuario |
| `width` | Ancho del campo de filtro |
| `tooltip` | Texto de ayuda / placeholder del campo |
| `newline` | Si es `false`, se coloca en la misma linea que el campo anterior |

**Ejemplo básico de busqueda por nombre:**

```xml
<asfilter>
    <field name="BUSCAR" fldname="NOMBRE"
           oper="##FLD## LIKE '%##VAL##%'" width="20"
           tooltip="Buscar por nombre">BUSCAR</field>
</asfilter>
```

> **Nota:** El contenido de texto del nodo `<field>` (ej. `BUSCAR`, `ALBARAN`) se usa como etiqueta visible del campo de filtro. La macro `##FLD##` se reemplaza por el valor de `fldname` y `##VAL##` por lo que el usuario escribe.

---

## 7. Nodo macro - Variables

### 7.1 Definición y uso

Las macros en XOne son variables que se resuelven en tiempo de ejecución. Se usan con la sintaxis `##NOMBRE##` tanto en atributos XML como en consultas SQL.

### 7.2 Macros del sistema

| Macro | Descripción | Uso típico |
|-------|-------------|------------|
| `##PREF##` | Prefijo de tablas en BD (ej: `gen_`) | Consultas SQL |
| `##ENTID##` | ID de la empresa/entidad actual | Filtros por empresa |
| `##USERID##` | ID del usuario logueado | Filtros por usuario |
| `##VERSION##` | Versión de la aplicación | Pantallas "Acerca de" |
| `##FRAME_VERSION##` | Versión del framework XOne | Información de sistema |
| `##APP##` | Ruta de la carpeta de la aplicación | Rutas de imágenes |
| `##EXIT##` | Comando para salir de la pantalla actual (con `appData.failWithMessage(-11888, ...)`). Para cerrar la app entera usar `appData.exit()` | Evento onback |
| `##NOW_TIME##` | Hora actual del sistema | Timestamps |

**Ejemplo de uso en SQL**:
```xml
<coll name="MisRegistros"
      sql="SELECT * FROM ##PREF##Registros WHERE USUARIO_ID = ##USERID##">
```

**Ejemplo de uso en ruta de imagen**:
```xml
<prop name="ICONO" type="IMG" path="##APP##\icons\xone.png" />
```

**Ejemplo de uso en create**:
```xml
<create>
    <action name="setval" field="MAP_VERSION"
            value="Versión ##VERSION## - Framework ##FRAME_VERSION##" />
</create>
```

### 7.3 Macros de campo (##FLD_CAMPO##)

Las macros `##FLD_CAMPO##` se resuelven al valor actual del campo especificado. Son útiles en:

- Filtros de contents
- Colores dinámicos
- Textos dinámicos en atributos

```xml
<!-- Color de fondo dinámico basado en un campo -->
<prop name="MAP_LABEL" type="L"
      bgcolor="##FLD_MAP_COLOR1##"
      forecolor="##FLD_MAP_COLOR2##" />

<!-- Imagen dinámica basada en un campo -->
<prop name="BTORDENAR" type="B"
      img="##FLD_MAP_BTORDEN##"
      imgsel="##FLD_MAP_BTORDENCLICK##" />

<!-- Título dinámico -->
<prop name="lblOrigen" type="L"
      title="##FLD_MAP_ORIGEN##" />

<!-- Filtro de contents con campo del padre -->
<contents name="@Detalles" src="Detalles"
          filter="ID_PADRE=##FLD_ID##" />
```

### 7.4 Macros de animación

| Macro | Descripción |
|-------|-------------|
| `##ALPHA_IN##` | Fade in (aparece) |
| `##ALPHA_OUT##` | Fade out (desaparece) |
| `##ZOOM_IN##` | Zoom in (agranda) |
| `##ZOOM_OUT##` | Zoom out (reduce) |
| `##LEFT_IN##` | Entrada desde la izquierda |
| `##LEFT_OUT##` | Salida hacia la izquierda |
| `##RIGHT_IN##` | Entrada desde la derecha |
| `##RIGHT_OUT##` | Salida hacia la derecha |
| `##TOP_IN##` | Entrada desde arriba |
| `##BOTTOM_IN##` | Entrada desde abajo |

**Uso en frames animados**:

```xml
<frame name="frmnuevochat"
       animation-in-delay="250"
       animation-out-delay="250"
       animation-in="##RIGHT_IN##"
       animation-out="##LEFT_OUT##"
       disablevisible="MAP_VERFLOTANTE=0"
       floating="true" top="0" left="0"
       width="100%" height="100%">
```

**Uso en navegación entre grupos**:

```javascript
ui.showGroup(2, "##ALPHA_IN##", 500, "##ALPHA_OUT##", 500);
```

### 7.5 Macros de coleccion — Nodo XML `<macro>` + API `setMacro`/`getMacro`

Las macros de coleccion permiten **parametrizar el SQL de una `<coll>`** (en `sql`, `filter`, subconsultas, etc.) y cambiar su valor en tiempo de ejecución desde JavaScript. Son la herramienta principal para filtros dinámicos por interaccion del usuario (ej: cambiar el filtro de una lista cuando se selecciona un combo).

> **No confundir con `appData.setGlobalMacro` / `getGlobalMacro`**: las macros globales son variables de aplicación (equivalentes a `localStorage` en navegador) y se leen desde cualquier punto. Las macros de coll viven dentro de **una sola coleccion** y solo afectan al SQL de esa coll. Ver también la API JavaScript en el tópico 03.

#### Declaración en el XML — nodo `<macro>`

Para que una macro de coll funcione, **debe declararse explicitamente** dentro de la `<coll>`. El nodo `<macro>` se coloca **al mismo nivel que los nodos `<group>`** (es decir, hijo directo de `<coll>`, no anidado dentro de un `<group>` ni de un `<frame>`).

Sintaxis:

```xml
<macro name="##NOMBRE##" value="valor por defecto" default="true" />
```

| Atributo | Descripción |
|----------|-------------|
| `name`   | Nombre de la macro con dobles `##...##`. Libre (ej. `##TIPO##`, `##FILTRO##`, `##MACRO1##`). Es el token que se sustituira en el SQL. |
| `value`  | Valor por defecto. Puede ser un literal (`"1"`, `"abc"`) o un fragmento SQL completo (ej. `"1=1"`, `"FILTRO='A'"`, una subconsulta entera). XOne lo inyecta tal cual en la consulta. |
| `default`| `true` o `false`. Indica si la macro se aplica desde el inicio (con su `value` por defecto). **Convencion: poner siempre `default="true"`** salvo que tengas una razón explicita para lo contrario. |

#### Ejemplo completo (declaración + uso en SQL + cambio desde JS)

```xml
<?xml version="1.0" encoding="iso-8859-15"?>
<coll name="ListaControles"
      progid="ASData.CASBasicDataObj"
      sql="SELECT ID, TITULO, FILTRO FROM ##PREF##CONTROLES WHERE ##TIPO##"
      objname="Controles"
      loadall="true">

    <!-- Declaracion de macros: al mismo nivel que los <group>, NO dentro de ninguno -->
    <macro name="##TIPO##" value="1=1" default="true" />

    <group name="General" id="1">
        <prop name="TITULO"  type="T"  visible="7" />
        <prop name="FILTRO"  type="T"  visible="7" />
    </group>
</coll>
```

Y desde JavaScript, en un `onchange` de un combo de la pantalla padre:

```javascript
// CORRECTO: setMacro / getMacro
var coll = self.getContents("content1");
if (self.TIPO == "TODOS") {
    coll.setMacro("##TIPO##", "1=1");
} else {
    coll.setMacro("##TIPO##", "FILTRO='" + self.TIPO.toString() + "'");
}
ui.refresh();
```

> **API correcta:** `setMacro("##NOMBRE##", valor)` y `getMacro("##NOMBRE##")`. **NUNCA** `coll.macro(...)` — esa forma no existe en XOne.

#### Casos de uso típicos

- Filtrar una lista por un valor de combo/segmented control.
- Cambiar la query SELECT entera de un content en función del estado de la pantalla padre (`coll.setMacro("##TIPO##", "SELECT ID, TITULO, FILTRO FROM GEN_CONTROLES WHERE FILTRO='" + valor + "'")`).
- Habilitar/deshabilitar un fragmento del WHERE poniendo la macro a `"1=1"` (todo) o a una clausula concreta.

#### Diferencias con `##FLD_CAMPO##`

| | `<macro>` + `setMacro` | `##FLD_CAMPO##` |
|---|---|---|
| Donde se define | Nodo `<macro>` en la coll + JS imperativo | En el `filter`/SQL del content directamente |
| Quien la cambia | Código JS llamando a `setMacro` | XOne automáticamente al cambiar el campo padre |
| Caso típico | Filtro dinámico por interaccion del usuario | Maestro-detalle (sub-content filtrado por el padre) |

