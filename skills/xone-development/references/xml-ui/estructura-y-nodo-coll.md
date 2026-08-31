# XOne XML — Estructura de los .xne y nodo coll

> Fuente: `xone/v2/xone-help-docs/topics/02a-xml-estructura.md` §1–§2. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §1 introducción al sistema de UI · §2 nodo coll: colecciones de datos vs especiales, valores de progid, atributos, sql y loadall

---

## 1. Introduccion al Sistema de UI

### 1.1 El modelo declarativo XML de XOne

XOne utiliza un sistema declarativo basado en XML para definir la interfaz de usuario de aplicaciones móviles nativas. Cada pantalla, formulario o lista se describe en un archivo con extensión `.xne`, que es un documento XML con etiquetas propietarias de la plataforma.

A diferencia de tecnologías web como HTML + CSS + JavaScript, donde la estructura, el estilo y la lógica están separados en archivos distintos, XOne combina los tres aspectos en un mismo archivo `.xne`:

- **Estructura**: Definida por los nodos XML (`<coll>`, `<group>`, `<frame>`, `<prop>`).
- **Estilos**: Aplicados mediante atributos inline o clases CSS propietarias (ver Tópico 04 - CSS).
- **Lógica**: Integrada mediante event handlers (`<create>`, `<load>`, `<onchange>`) y nodos custom que contienen JavaScript (ver Tópico 03 - JavaScript API).

### 1.2 Jerarquía: coll > group > frame > prop

La estructura de UI en XOne sigue una jerarquía estricta:

```
<coll>                        ← Coleccion (raiz de la pantalla)
  ├── <group>                 ← Agrupacion / pestana
  │     ├── <frame>           ← Contenedor visual
  │     │     ├── <prop>      ← Campo / control
  │     │     ├── <prop>      ← Campo / control
  │     │     └── <frame>     ← Frame anidado
  │     │           └── <prop>
  │     └── <prop>            ← Campo directo en grupo
  ├── <group>                 ← Otra pestana
  ├── <contents>              ← Coleccion embebida
  ├── <create>                ← Evento de creacion
  ├── <load>                  ← Evento de carga
  ├── <onchange>              ← Evento de cambio
  └── <onback>                ← Evento de retroceso
```

**Reglas clave**:
- `<coll>` es siempre el nodo raiz.
- Los `<group>` son hijos directos de `<coll>` y definen secciones o pestanas.
- Los `<frame>` pueden estar dentro de `<group>` o anidados dentro de otros `<frame>`.
- Los `<prop>` pueden estar dentro de `<group>` o `<frame>`.
- Los `<contents>` se declaran como hijos directos de `<coll>` (o dentro de frames/groups en algunos casos).
- Los event handlers se declaran como hijos directos de `<coll>`.

### 1.3 Diferencias con HTML/CSS/JS web

Si vienes del mundo web, estas son las diferencias fundamentales:

| Aspecto | HTML/CSS/JS Web | XOne XML |
|---------|----------------|----------|
| Extensión de archivo | `.html`, `.css`, `.js` | `.xne` (todo junto) |
| Nodo raiz | `<html>` | `<coll>` |
| Contenedores | `<div>`, `<section>` | `<frame>`, `<group>` |
| Campos de entrada | `<input>`, `<select>` | `<prop type="T">` (texto), `<prop type="T" mapcol="..." mapfld="...">` (selector/combo) |
| Botones | `<button>` | `<prop type="B">` |
| Imágenes | `<img>` | `<prop type="IMG">` |
| Listas | `<ul>`, `<table>` | `<prop type="Z">` + `<contents>` |
| Unidades CSS | `px`, `em`, `rem` | `p` (puntos), `%` (porcentaje) |
| Layout | Flexbox, Grid | Flujo lineal con `newline`, `width`, `align` |
| Eventos | `addEventListener` | Nodos XML: `<create>`, `<onchange>`, etc. |
| Estilos | CSS3 estándar | CSS propietario XOne (ver Tópico 04) |

> **Importante**: NO uses atributos o funciones de HTML/CSS/JS web estándar. XOne tiene su propia API (ver Tópico 03 - JavaScript) y su propio sistema CSS (ver Tópico 04 - CSS).

### 1.4 Declaración XML y encoding

Todo archivo `.xne` debe comenzar con la declaración XML:

```xml
<?xml version="1.0" encoding="utf-8"?>
```

Los encodings más comunes son:
- `utf-8` (recomendado para proyectos nuevos)
- `iso-8859-1`
- `iso-8859-15`

---

## 2. Nodo coll - Colecciones

El nodo `<coll>` es el nodo raiz de cada archivo `.xne`. Representa una **coleccion**, que en XOne puede ser:
- Una **pantalla** de la aplicación (menú, formulario, etc.).
- Una **tabla de base de datos** con su interfaz visual asociada.
- Un **contenedor de lógica** sin datos reales (`special="true"`).

### 2.1 Atributos de identificación

| Atributo | Tipo | Requerido | Descripción |
|----------|------|-----------|-------------|
| `name` | string | **Si** | Nombre único de la coleccion. Usa PascalCase: `MenuPrincipal`, `DetalleProducto`. |
| `title` | string | No | Título visible en la barra de la aplicación. Si se omite, no muestra título. |
| `objname` | string | No | Nombre del objeto de datos en la base de datos. Suele coincidir con el nombre de la tabla. |
| `updateobj` | string | No | Nombre del objeto para operaciones de escritura (INSERT, UPDATE, DELETE). |
| `progid` | string | No | Identificador del tipo de objeto de negocio. |

**Ejemplo**:
```xml
<coll name="Clientes" title="Lista de Clientes"
      objname="Clientes" updateobj="Clientes">
```

### 2.2 Atributos de datos

| Atributo | Tipo | Descripción | Ejemplo |
|----------|------|-------------|---------|
| `sql` | string | Consulta SQL para cargar datos. Usar `##PREF##` para el prefijo de tabla. | `sql="SELECT * FROM ##PREF##Clientes"` |
| `filter` | string | Filtro SQL adicional (clausula WHERE). | `filter="ACTIVO=1"` |
| `sort` | string | Ordenamiento de datos (clausula ORDER BY). | `sort="NOMBRE ASC"` |
| `connection` | string | Nombre de la conexión a base de datos si no es la principal. | `connection="GpsConnection"` |
| `loadall` | boolean | Si es `true`, carga todos los registros al abrir. | `loadall="true"` |
| `dependent` | boolean | Indica si la coleccion depende de una coleccion padre. | `dependent="false"` |
| `check-owner` | boolean | Verifica que los registros pertenezcan al usuario/empresa actual. | `check-owner="false"` |
| `page-limit-off` | string | Desactiva la paginación automática. | `page-limit-off="1"` |
| `userawsql` | boolean | Usar SQL sin procesar (sin modificaciones del framework). | `userawsql="true"` |
| `autorefresh` | boolean | Refresca datos automáticamente al regresar de otra ventana o pantalla. | `autorefresh="true"` |
| `start-from-bottom` | boolean | El scroll empieza desde el final y se mantiene anclado al último elemento (estilo chat). Se puede declarar aquí en la coll o en el propio content (el prop `type="Z"`); si está en ambos, gana el del content. | `start-from-bottom="true"` |
| `no-data-text` | string | Texto a mostrar cuando la coleccion no tiene registros. | `no-data-text="Sin datos"` |
| `stringkey` | boolean | Indica que la clave primaria es de tipo texto en lugar de entero. | `stringkey="true"` |
| `idfieldname` | string | Nombre del campo que actua como clave primaria cuando no se llama `ID`. | `idfieldname="CODIGO"` |

**Ejemplo con SQL compleja**:
```xml
<coll name="ContentDatos"
      sql="select t1.*, t1.NOMBRE as MAP_NOMBRE_GRID,
           t1.DIRECCION as MAP_DIRECCION_GRID,
           replace(t1.LATITUD, ',', '.') as MAP_LATITUD_GRID
           from ##PREF##mapa_datos t1"
      objname="mapa_datos"
      updateobj="mapa_datos"
      loadall="true"
      check-owner="false"
      dependent="false">
```

### 2.3 Atributos visuales

| Atributo | Tipo | Descripción | Ejemplo |
|----------|------|-------------|---------|
| `bgcolor` | color | Color de fondo de la coleccion. | `bgcolor="#FFFFFF"` |
| `notab` | boolean | Oculta las pestanas de navegación entre grupos. | `notab="true"` |
| `special` | boolean | Marca como coleccion especial (sin tabla real en BD). | `special="true"` |
| `show-toolbar` | boolean | Muestra u oculta la barra de herramientas del sistema. | `show-toolbar="false"` |
| `show-footer` | boolean | Muestra u oculta el pie de página del sistema. | `show-footer="true"` |
| `group-theme` | string | Tema visual para los tabs de grupo. | `group-theme="material"` |
| `tab-mode` | string | Modo de los tabs: `scrollable` o `fixed`. | `tab-mode="scrollable"` |
| `group-swipe` | boolean | Permite deslizar entre grupos con gesto. | `group-swipe="true"` |
| `no-data-align` | string | Alineacion del mensaje "sin datos". | `no-data-align="center"` |
| `cell-selected-bgcolor` | color | Color de fondo de celda seleccionada. | `cell-selected-bgcolor="#00FF00"` |
| `cell-selected-border-color` | color | Color del borde de celda seleccionada. | `cell-selected-border-color="#00000000"` |
| `cell-odd-color` | color | Color de filas impares. | `cell-odd-color="#FFFFFF"` |
| `cell-even-color` | color | Color de filas pares. | `cell-even-color="#F2F2F2"` |
| `cell-height` | dimensión | Alto fijo de cada fila en modo listado (en puntos `p`). | `cell-height="80p"` |
| `cell-tpadding` | dimensión | Margen interior superior de cada celda. | `cell-tpadding="4p"` |
| `cell-bpadding` | dimensión | Margen interior inferior de cada celda. | `cell-bpadding="4p"` |
| `cell-bgcolor` | color | Color de fondo general de todas las celdas. | `cell-bgcolor="#FFFFFF"` |

### 2.4 Valores de progid

El atributo `progid` define el tipo de objeto de datos:

| Valor | Descripción |
|-------|-------------|
| `ASData.CASBasicDataObj` | Objeto de datos básico (el más común) |
| `ASGestion.CASEmpresa` | Objeto de gestion de empresa (para coleccion Empresas) |
| `ASGestion.CASUser` | Objeto de gestion de usuario (para coleccion Usuarios) |

> **Nota**: `progid` es **opcional**. Si se omite, la coll se comporta como un objeto de datos genérico (equivalente a `ASData.CASBasicDataObj`). Solo los casos especiales lo requieren: **Empresas** usa `ASGestion.CASEmpresa` y **Usuarios** `ASGestion.CASUser`, normalmente en `mappings.xne`.

#### `ID` y `ROWID`: columnas de plataforma (no hace falta declararlas)

Los campos `ID` y `ROWID` existen siempre en toda tabla persistida (con `objname`) **a nivel de base de datos** y XOne **gestiona sus valores automáticamente** (el `ID` es autonumérico; el `ROWID` lo autogenera el framework). **No hace falta declararlos** como nodo `<prop>` dentro del `<group>`: declararlos es válido pero redundante, así que la recomendación es omitirlos por limpieza.

| Campo  | Tipo BD | ¿Hace falta declararlo como `<prop>`? | ¿Incluir en el SELECT del `sql=`? |
|--------|---------|--------------------------|-----------------------------------|
| `ID`   | N (autoincremental, clave primaria) | **No** (redundante, aunque válido) | **SI** — siempre |
| `ROWID`| T size 32 (GUID hex sin guiones, gestionado por XOne para la replica) | **No** (redundante, aunque válido) | **NO** — no es necesario |

```xml
<!-- REDUNDANTE: declarar ID y ROWID (es válido, pero los gestiona XOne) -->
<coll name="Clientes" progid="ASData.CASBasicDataObj"
      sql="SELECT * FROM ##PREF##Clientes" objname="Clientes" updateobj="Clientes">
    <group name="General" id="1">
        <prop name="ID" type="N" visible="0" />              <!-- redundante: lo gestiona XOne -->
        <prop name="NOMBRE" type="T" visible="7" />
        <prop name="ROWID" type="T" size="32" visible="0" /> <!-- redundante: lo gestiona XOne -->
    </group>
</coll>

<!-- RECOMENDADO (más limpio): solo campos de negocio; el ID se rescata en el SELECT -->
<coll name="Clientes" progid="ASData.CASBasicDataObj"
      sql="SELECT ID, NOMBRE FROM ##PREF##Clientes" objname="Clientes" updateobj="Clientes">
    <group name="General" id="1">
        <prop name="NOMBRE" type="T" visible="7" />
    </group>
</coll>
```

> Aplica a TODAS las colls, incluidas Empresas (`ASGestion.CASEmpresa`) y Usuarios (`ASGestion.CASUser`).

#### Convencion de prefijos en nombres de campos

| Prefijo | Uso | Ejemplo |
|---------|-----|---------|
| _(sin prefijo)_ | Campo de la tabla principal — se graba en BD | `NOMBRE`, `FECHA`, `ESTADO` |
| `MAP_` | Campo de tabla enlazada (JOIN) — **no** se graba en BD | `MAP_NOMBRE_CLIENTE`, `MAP_TOTAL` |
| `ID` + nombre | Clave foranea de enlace a otra coleccion | `IDCLIENTE`, `IDEMPRESA` |
| `@` | Campo de tipo `Z` (contents embebido) | `@LineasPedido` |
| `%` | Campo de tipo `NC` usado como bitmask | `%OPCIONES` |
| `$` | Campo calculado (formula) | `$IMPORTE_TOTAL` |

### 2.5 Colecciones especiales vs colecciones de datos

**Coleccion especial** (`special="true"`): **el framework NO gestiona sus datos.**

- No tiene tabla en la base de datos.
- **`sql`, `objname` y `updateobj` no se requieren, y si se ponen el framework los IGNORA.**
  Vacíos o ausentes, las dos formas valen. Esto no es lo mismo que «no hacen falta»: un `sql`
  escrito aquí **no se ejecuta**, y ése es el síntoma clásico de pantalla vacía en una coll
  especial — el `SELECT` está, parece correcto, y nadie lo corre.
- Tiene **dos usos**, que son el mismo visto sin datos y con ellos:
  1. **Pantalla de puro UI** — menú, login, bienvenida (`EntradaApp`), buscador, o una coll base
     para heredar con `inherits`. Los `<prop>` son memoria temporal.
  2. **Coleccion llenada desde script** — se rellena a mano con `addItem` (por ejemplo tras
     llamar a una API) para pintarla en un `<contents>` o para buscar sobre ella. Los datos son
     reales; lo que no hay es una tabla detrás que el framework cargue y guarde solo.
- **No confundir con `<entry-point>`**, el nodo de `app.xml` que dice qué coleccion se abre al
  entrar: esa coll suele ser `special`, pero son cosas distintas.

```xml
<coll name="MenuPrincipal" title="Menu"
      special="true" notab="true" bgcolor="#FFFFFF">
    <!-- Solo lógica y UI, sin datos en BD -->
</coll>
```

**Coleccion de datos**:
- Tiene tabla en la base de datos.
- Requiere `sql`, `objname` y `updateobj`.
- Los campos `<prop>` se mapean a columnas de la tabla.

```xml
<coll name="Clientes"
      sql="SELECT * FROM ##PREF##Clientes"
      objname="Clientes" updateobj="Clientes"
      loadall="true">
    <!-- Campos mapeados a columnas de gen_clientes -->
</coll>
```

### 2.6 Ejemplo completo comentado

Ejemplo real basado en el proyecto UseCars:

```xml
<?xml version="1.0" encoding="utf-8"?>
<!--
    MenuPrincipal - Pantalla principal con mapa
-->
<coll name="MenuPrincipal" title="UseCars"
      notab="true"
      show-toolbar="false"
      bgcolor="#FFFFFF">

    <!-- Evento create: se ejecuta una sola vez al crear -->
    <create>
        <script>
            self.MAP_ORIGEN = "";
            self.MAP_DESTINO = "";
            self.MAP_TIPO_VEHICULO = "ECONOMY";
        </script>
    </create>

    <!-- Inicializar la pantalla cada vez que se abre: usar before-edit -->
    <before-edit refresh="false" show-wait-dialog="false">
        <script>
            let usuario = obtenerUsuarioActual();
            if (usuario) {
                self.MAP_NOMBRE_USUARIO = usuario.NOMBRE;
            }
        </script>
    </before-edit>

    <!-- Grupo principal sin pestana -->
    <group name="grpPrincipal" id="1" class="groupNoTab">
        <frame name="frmMapa" width="100%" height="100%">
            <prop name="MAP_MAPA" type="Z" viewmode="mapview" visible="7"
                  width="100%" height="100%"
                  show-user-location="true"/>
        </frame>
    </group>

    <!-- Evento al pulsar atrás -->
    <onback>
        <script>
            if (confirmar("Desea salir?", "Salir")) {
                appData.exit();
            }
        </script>
    </onback>
</coll>
```

### 2.7 Buenas prácticas

1. **Nombres descriptivos en PascalCase**: `MenuPrincipal`, `DetallePedido`, `ListaClientes`.
2. **Usar `##PREF##`** siempre en consultas SQL para compatibilidad con el prefijo de tablas.
3. **`special="true"`** para pantallas sin datos: menús, login, pantallas de selección.
4. **`notab="true"`** cuando la pantalla tiene un solo grupo visible (sin pestanas).
5. **`show-toolbar="false"`** para pantallas con header personalizado.
6. **No mezclar** `special="true"` con consultas SQL.

### 2.8 Errores comunes

| Error | Consecuencia | Solución |
|-------|-------------|----------|
| Olvidar `name` | La coleccion no se identifica | Siempre incluir `name` único |
| SQL sin `##PREF##` | Error "tabla no encontrada" | Usar `##PREF##` antes del nombre de tabla |
| `special="true"` con `sql` | Comportamiento indefinido | Usar uno u otro, nunca ambos |
| `loadall="true"` en tabla grande | Lentitud al cargar | Solo para tablas con pocos registros |
| `objname` diferente al nombre de tabla | No se guardan los datos | `objname` debe coincidir con el nombre de tabla (sin prefijo) |
