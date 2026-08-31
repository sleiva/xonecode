# XOne XML — asfilter, visibilidad, event handlers y macros del sistema

> Fuente: `xone/v2/xone-project-generator/references/xone-xml-ui-c-contents-eventos.md` §7b–§10. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §7b nodo asfilter (filtros de búsqueda) · §8 event handlers detallados · §9 sistema de visibilidad · §10 macros del sistema

---

## 7b. Nodo asfilter - Filtros de Busqueda

El nodo `<asfilter>` define filtros de busqueda que permiten al usuario filtrar registros dentro de una coleccion de tipo lista. Se coloca como hijo directo de `<coll>`.

### Sintaxis

```xml
<asfilter fontsize="8" left="12" sort="false">
    <field name="NOMBRE" fldname="NOMBRE"
           oper="##FLD## LIKE '##VAL##%'" width="15"
           tooltip="Nombre" newline="false">NOMBRE</field>
    <field name="FECHA" fldname="FECHA"
           oper="##FLD## >= '##VAL##'" width="10"
           tooltip="Fecha desde">FECHA DESDE</field>
</asfilter>
```

### Atributos de `<asfilter>`

| Atributo | Tipo | Descripción | Ejemplo |
|----------|------|-------------|---------|
| `fontsize` | int | Tamaño de fuente de los campos del filtro | `fontsize="8"` |
| `left` | int | Margen izquierdo del panel de filtros | `left="12"` |
| `sort` | bool | Habilita ordenamiento en el filtro | `sort="false"` |

### Atributos de `<field>` dentro de asfilter

| Atributo | Tipo | Descripción | Ejemplo |
|----------|------|-------------|---------|
| `name` | string | Nombre del campo de filtro | `name="NUMCOMPLETO"` |
| `fldname` | string | Nombre del campo real en la tabla de BD | `fldname="NUMCOMPLETO"` |
| `oper` | string | Operador SQL. Usa `##FLD##` para el nombre del campo y `##VAL##` para el valor ingresado por el usuario | `oper="##FLD## LIKE '##VAL##%'"` |
| `width` | int | Ancho del campo de filtro | `width="15"` |
| `tooltip` | string | Texto de ayuda / placeholder del campo de filtro | `tooltip="Albaran"` |
| `newline` | bool | Si es `false`, se coloca en la misma linea que el anterior | `newline="false"` |

### Operadores SQL Comunes en asfilter

| Operador | Descripción | Ejemplo |
|----------|-------------|---------|
| `##FLD## LIKE '##VAL##%'` | Comienza con el valor ingresado | Busqueda por inicio de texto |
| `##FLD## LIKE '%##VAL##%'` | Contiene el valor ingresado | Busqueda parcial |
| `##FLD## = '##VAL##'` | Igual exacto | Busqueda exacta |
| `##FLD## >= '##VAL##'` | Mayor o igual | Filtro desde fecha/valor |
| `##FLD## <= '##VAL##'` | Menor o igual | Filtro hasta fecha/valor |

### Ejemplo: Lista con asfilter

```xml
<coll name="ListaAlbaranes"
      sql="SELECT * FROM ##PREF##Albaranes"
      objname="Albaranes" loadall="true"
      notab="true" show-toolbar="false">

    <asfilter fontsize="8" left="12" sort="false">
        <field name="NUMCOMPLETO" fldname="NUMCOMPLETO"
               oper="##FLD## LIKE '##VAL##%'" width="15"
               tooltip="Albaran" newline="false">ALBARAN</field>
        <field name="FECHA_DESDE" fldname="FECHA"
               oper="##FLD## >= '##VAL##'" width="10"
               tooltip="Fecha desde">FECHA DESDE</field>
        <field name="FECHA_HASTA" fldname="FECHA"
               oper="##FLD## <= '##VAL##'" width="10"
               tooltip="Fecha hasta" newline="false">FECHA HASTA</field>
    </asfilter>

    <group name="Lista" id="1">
        <!-- Campos de la lista -->
    </group>
</coll>
```

---

## 8. Event Handlers Detallados

### Estructura General de un Handler

```xml
<nombreEvento show-wait-dialog="false" refresh="false">
    <action name="runscript">
        <param name="parametro1" />
        <param name="parametro2" />
        <script language="javascript">
            // Código JavaScript
        </script>
    </action>
</nombreEvento>
```

### Atributos del Handler

| Atributo | Tipo | Descripción | Ejemplo |
|----------|------|-------------|---------|
| `show-wait-dialog` | bool | Mostrar dialogo de espera mientras ejecuta | `show-wait-dialog="false"` |
| `refresh` | bool | Refrescar la UI después de ejecutar | `refresh="false"` |

### Tipos de Acciones

| Action name | Descripción | Ejemplo |
|-------------|-------------|---------|
| `runscript` | Ejecutar código JavaScript | `<action name="runscript">` |
| `setval` | Establecer valor de un campo | `<action name="setval" field="CAMPO" value="valor" />` |

### Handler: create

Se ejecuta UNA SOLA VEZ cuando se crea el objeto. Ideal para inicialización.

```xml
<create>
    <action name="setval" field="MAP_VERSION"
        value="Versión ##VERSION## - Framework ##FRAME_VERSION##" />
    <action name="runscript">
        <script language="javascript">
            self.MAP_HUELLA = 0;
            if (fingerprintManager.isHardwareAvailable()) {
                if (fingerprintManager.hasEnrolledFingerprints()) {
                    self.MAP_HUELLA = 1;
                }
            }
        </script>
    </action>
</create>
```

### Handler: load

Se ejecuta cuando se cargan los datos de un `<contents>` embebido. **No es el evento que se dispara al mostrar la pantalla** — para eso usar `before-edit`. El uso de `load` es infrecuente y especifico para reaccionar a la carga de un contents.

```xml
<load>
    <action name="runscript">
        <script language="javascript">
            // Código que se ejecuta cuando un contents carga sus datos
        </script>
    </action>
</load>
```

### Handler: onchange

Se ejecuta cuando cambia el valor de cualquier campo.

```xml
<onchange>
    <!-- Handler para un campo específico -->
    <field name="MAP_CANTIDAD">
        <action name="runscript">
            <script language="javascript">
                self.MAP_TOTAL = self.MAP_CANTIDAD * self.MAP_PRECIO;
                ui.refresh("MAP_TOTAL");
            </script>
        </action>
    </field>

    <!-- Handler generico para CUALQUIER campo (##ANY##) -->
    <field name="##ANY##">
        <action name="runscript">
            <param name="ChgField" />
            <script language="javascript">
                console.log("Campo modificado: " + ChgField);
            </script>
        </action>
    </field>
</onchange>
```

### Handler: onback

Se ejecuta al pulsar el botón atrás del dispositivo.

```xml
<onback show-wait-dialog="false" refresh="false">
    <action name="runscript">
        <script language="javascript">
            let window = ui.getView(self);
            if (window) {
                window.exit();
            }
        </script>
    </action>
</onback>
```

Para la pantalla de entrada (salir de la app):

```xml
<onback show-wait-dialog="false" refresh="false">
    <action name="runscript">
        <script language="javascript">
            appData.exit();
        </script>
    </action>
</onback>
```

### Handler: selecteditem

Se ejecuta al seleccionar un elemento en una lista.

```xml
<selecteditem show-wait-dialog="false" refresh="false">
    <action name="runscript">
        <param name="view" />
        <script language="javascript">
            ui.openEditView(self);
        </script>
    </action>
</selecteditem>
```

### Handler: before-edit

Se ejecuta ANTES de entrar en modo edición de un registro. Ideal para preparar datos, vincular eventos y configurar la vista.

```xml
<before-edit refresh="false" show-wait-dialog="false">
    <action name="runscript">
        <script language="javascript">
            self.MAP_LOADING = 0;
            var vista = ui.getView(self);
            vista.bind("BTN_ACCION", "onclick", manejarClick);
        </script>
    </action>
</before-edit>
```

### Handler: after-edit

Se ejecuta DESPUES de entrar en modo edición. Útil para cargar datos adicionales o actualizar la interfaz.

```xml
<after-edit refresh="false" show-wait-dialog="false">
    <action name="runscript">
        <script language="javascript">
            self.MAP_VERSION = "Versión: " + appData.getGlobalMacro("##VERSION##");
            ui.refresh("MAP_VERSION");
        </script>
    </action>
</after-edit>
```

### Handler: update

Se ejecuta al actualizar un registro existente en la base de datos.

```xml
<update>
    <action name="setval" field="FECHAMOD" value="##NOW##" />
    <action name="setval" field="USUARIO_MOD" value="##USERID##" />
</update>
```

### Handler: insert

Se ejecuta después de insertar un nuevo registro en la base de datos.

```xml
<insert refresh="true" show-wait-dialog="false">
    <action name="runscript">
        <script language="javascript">
            ui.showToast("Registro creado exitosamente");
        </script>
    </action>
</insert>
```

### Handler: delete

Se ejecuta al eliminar un registro. Se puede cancelar la eliminación lanzando un error.

```xml
<delete refresh="true" show-wait-dialog="false">
    <action name="runscript">
        <script language="javascript">
            if (self.TIENE_DEPENDENCIAS == 1) {
                throw new Error("No se puede eliminar: existen registros dependientes");
            }
        </script>
    </action>
</delete>
```

### Handlers Personalizados (Custom)

Se definen con nombres propios y se invocan con `ExecuteNode()`.

**Definición:**

```xml
<aceptarLogin refresh="false">
    <action name="runscript">
        <script language="javascript">
            hacerLogin(self.MAP_USUARIO, self.MAP_PASSWORD);
        </script>
    </action>
</aceptarLogin>

<!-- Handler con parametros -->
<irGrupo show-wait-dialog="false">
    <action name="runscript">
        <param name="grupo" />
        <script language="javascript">
            ui.showGroup(parseInt(grupo));
        </script>
    </action>
</irGrupo>
```

**Invocación desde prop (3 formas):**

```xml
<!-- Forma 1: method con executenode -->
<prop name="MAP_BTN" type="B"
    method="executenode(aceptarLogin)" />

<!-- Forma 2: Con parametros -->
<prop name="MAP_BTN2" type="B"
    method="executenode(irGrupo(2))" />

<!-- Forma 3: onclick con self.executeNode (script JS inline, requiere ';' al final) -->
<!-- IMPORTANTE: el nombre del nodo va como STRING LITERAL, no como llamada a función. -->
<!-- MAL: onclick="ExecuteNode(loginHuella());"  (ExecuteNode no es global y loginHuella() se evaluaría) -->
<!-- BIEN: usar self.executeNode con el nombre del nodo entre comillas. -->
<prop name="MAP_BTN3" type="B"
    onclick="self.executeNode('loginHuella');" />

<!-- Con parámetros (se pasan después del nombre del nodo): -->
<prop name="MAP_BTN4" type="B"
    onclick="self.executeNode('irGrupo', 2);" />
```

---

## 9. Sistema de Visibilidad

### Mapa de Bits (Bitmask)

El atributo `visible` es un **mapa de bits** que controla en que contextos se muestra una propiedad.

| Bit | Valor | Contexto |
|-----|-------|----------|
| 0 | 1 | Visible en **modo edición** (formulario individual) |
| 1 | 2 | Visible en **modo lista** (fila de la lista) |
| 2 | 4 | Visible en **lista contenida** (content/embebida) |
| 3 | 8 | Visible en **desplegable** (combo) |

### Combinaciones Comunes

| Valor | Bits Activos | Significado | Uso Típico |
|-------|-------------|-------------|------------|
| `0` | ninguno | **Oculto** en todos los modos | Campos internos, IDs, calculos ocultos |
| `1` | bit 0 | Solo en **edición** | Campos de formulario, botones de acción |
| `2` | bit 1 | Solo en **lista** | Resumen, campos visibles en la fila |
| `3` | bits 0,1 | **Edición y lista** | Campos principales que se ven siempre |
| `4` | bit 2 | Solo en **content** | Campos visibles solo en listas embebidas |
| `7` | bits 0,1,2 | **Todos los modos** (excepto combo) | Campos universales, la mayoría de campos visibles |

### Visibilidad Condicional (disablevisible)

El atributo `disablevisible` permite ocultar/mostrar campos dinámicamente según el valor de otros campos.

**Sintaxis:** `disablevisible="CAMPO_CONDICION=VALOR_QUE_OCULTA"`

Cuando la condición se cumple, el campo SE OCULTA.

```xml
<!-- Se OCULTA cuando MAP_TIPO vale 0 -->
<prop name="MAP_DETALLE" type="T" visible="7"
    disablevisible="MAP_TIPO=0" />

<!-- Se OCULTA cuando MAP_ERROR esta vacio -->
<frame name="frmError"
    disablevisible="MAP_ERROR=''"
    floating="true">
    <prop name="MAP_ERROR" type="L" visible="1"
        forecolor="#F44336" />
</frame>
```

---

## 10. Macros del Sistema

Las macros son tokens que XOne resuelve en tiempo de ejecución. Se usan en atributos XML con formato `##NOMBRE##`.

### Macros de Base de Datos

| Macro | Descripción | Uso Típico |
|-------|-------------|------------|
| `##PREF##` | Prefijo de tablas en BD (definido en `<app prefix="...">`) | `SELECT * FROM ##PREF##Usuarios` |
| `##ENTID##` | ID de la empresa/entidad actual | `WHERE IDEMPRESA = ##ENTID##` |
| `##USERID##` | ID del usuario actualmente logueado | `WHERE ID_USUARIO = ##USERID##` |

### Macros de Fecha y Hora

| Macro | Descripción | Uso Típico |
|-------|-------------|------------|
| `##NOW##` | Fecha y hora actual del sistema | `<action name="setval" field="FECHA" value="##NOW##" />` |
| `##NOW_TIME##` | Hora actual del sistema | `<action name="setval" field="HORA" value="##NOW_TIME##" />` |

### Macros de Aplicación

| Macro | Descripción | Uso Típico |
|-------|-------------|------------|
| `##VERSION##` | Versión de la aplicación (definida en `<app versión="...">`) | `title="Versión ##VERSION##"` |
| `##FRAME_VERSION##` | Versión del framework XOne | `title="Framework ##FRAME_VERSION##"` |
| `##FRAME_VERSION_CODE##` | Código de versión numérico del framework | Consola técnica |
| `##LIVEUPDATE_VERSION##` | Versión del módulo XOneLive (actualización OTA). Si no esta instalado, la macro no se sustituye | Consola técnica |
| `##APP##` | Ruta de la carpeta de la aplicación en el dispositivo | `path="##APP##\icons\imagen.png"` |

### Macros de Dispositivo

| Macro | Descripción | Uso Típico |
|-------|-------------|------------|
| `##DEVICEID##` | Identificador único del dispositivo (IMEI o equivalente) | `filter="DEVICE=##DEVICEID##"` |
| `##MID##` | Machine ID del dispositivo (identificador interno XOne) | `title="MID: ##MID##"` |
| `##DEVICE_MODEL##` | Modelo del dispositivo (ej. "Samsung Galaxy S21") | `title="Modelo: ##DEVICE_MODEL##"` |
| `##DEVICE_OS##` | Sistema operativo: `android` o `ios` | `disablevisible="MAP_OS='ios'"` |
| `##DEVICE_OSVERSION##` | Versión del sistema operativo | `title="SO: ##DEVICE_OSVERSION##"` |
| `##DEVICE_MANUFACTURER##` | Fabricante del dispositivo | `title="Fabricante: ##DEVICE_MANUFACTURER##"` |
| `##DEVICE_TYPE##` | Tipo de dispositivo (phone, tablet...) | `title="Tipo: ##DEVICE_TYPE##"` |
| `##CURRENT_ORIENTATION##` | Orientación actual: `portrait` o `landscape` | Lógica de layout |
| `##CURRENT_DENSITY##` | Tipo de densidad de pantalla (ldpi, mdpi, hdpi...) | Consola técnica |
| `##CURRENT_DENSITY_VALUE##` | Valor numérico de la densidad de pantalla | Consola técnica |
| `##SCREEN_RESOLUTION_WIDTH##` | Ancho de pantalla en pixels | Consola técnica |
| `##SCREEN_RESOLUTION_HEIGHT##` | Alto de pantalla en pixels | Consola técnica |

### Cerrar pantalla / cerrar aplicación

Formas correctas desde JavaScript:

```javascript
// Cerrar la ventana/pantalla actual
ui.getView(self).exit();

// Cerrar toda la aplicación
appData.exit();
```

**Código heredado:** En proyectos antiguos puede aparecer `appData.failWithMessage(-11888, "##EXIT##")` (con la macro `##EXIT##`) para cerrar la pantalla. Sigue funcionando, pero las formas de arriba son preferidas.

### Macros de Campos Dinámicas (`##FLD_CAMPO##`)

Las macros `##FLD_CAMPO##` se resuelven al valor actual del campo especificado. Son fundamentales para:
- Filtros de contents (relaciones maestro-detalle)
- Colores dinámicos basados en datos
- Textos e imágenes dinámicas en atributos
- Cualquier atributo XML que necesite un valor del registro actual

| Macro | Descripción |
|-------|-------------|
| `##FLD_NOMBRE_CAMPO##` | Se reemplaza por el valor actual del campo `NOMBRE_CAMPO` |

```xml
<!-- Color de fondo dinámico basado en un campo -->
<prop name="MAP_LABEL" type="L"
      bgcolor="##FLD_MAP_COLOR##" />

<!-- Imagen dinámica basada en un campo -->
<prop name="BTN_ORDENAR" type="B"
      img="##FLD_MAP_ICONO_ORDEN##" />

<!-- Filtro de contents con campo del padre -->
<contents name="@Detalles" src="LineasDetalle"
          filter="ID_PADRE=##FLD_ID##" />
```

### Macros de Coleccion — Nodo XML `<macro>` + `setMacro`/`getMacro`

Las macros de coleccion son **distintas** de las macros del sistema y de las `##FLD_CAMPO##`. Son tokens definidos por el desarrollador en el XML de una `<coll>` que se sustituyen en su SQL/filter en tiempo de ejecución, y cuyo valor se cambia desde JavaScript con `setMacro` / `getMacro`. Es la herramienta principal para **filtros dinámicos por interaccion del usuario** (ej. cambiar el filtro de una lista cuando se elige un combo).

#### Declaración en XML — nodo `<macro>`

El nodo `<macro>` se coloca **al mismo nivel que los nodos `<group>`** (hijo directo de `<coll>`, no anidado dentro de un `<group>` ni de un `<frame>`).

```xml
<macro name="##NOMBRE##" value="valor por defecto" default="true" />
```

| Atributo | Descripción |
|----------|-------------|
| `name`   | Nombre con `##...##`. Libre (`##TIPO##`, `##FILTRO##`, `##MACRO1##`...). |
| `value`  | Valor por defecto. Puede ser un literal o un fragmento SQL completo (ej. `"1=1"`, `"FILTRO='A'"`, una subconsulta entera). Se inyecta tal cual donde aparezca el token en el SQL. |
| `default`| `true`/`false`. Indica si la macro se aplica por defecto. **Convencion: poner siempre `default="true"`** salvo que tengas razón explicita para lo contrario. |

#### Ejemplo end-to-end (XML + JS)

```xml
<?xml version="1.0" encoding="iso-8859-15"?>
<coll name="ListaControles"
      progid="ASData.CASBasicDataObj"
      sql="SELECT ID, TITULO, FILTRO FROM ##PREF##CONTROLES WHERE ##TIPO##"
      objname="Controles"
      loadall="true">

    <!-- Declaracion de la macro: al mismo nivel que <group> -->
    <macro name="##TIPO##" value="1=1" default="true" />

    <group name="General" id="1">
        <prop name="TITULO" type="T" visible="7" />
        <prop name="FILTRO" type="T" visible="7" />
    </group>
</coll>
```

```javascript
// Cambio del filtro desde un onchange de un combo en la pantalla padre
var coll = self.getContents("content1");
if (self.TIPO == "TODOS") {
    coll.setMacro("##TIPO##", "1=1");           // No filtra (todo)
} else {
    coll.setMacro("##TIPO##", "FILTRO='" + self.TIPO.toString() + "'");
}
ui.refresh();
```

> **API correcta:** `setMacro("##NOMBRE##", valor)` y `getMacro("##NOMBRE##")`. **NUNCA** `coll.macro(...)` — esa forma no existe en XOne y produce error.

> **Diferencia con `setGlobalMacro`:** `coll.setMacro` afecta SOLO al SQL de esa coleccion. `appData.setGlobalMacro` guarda un valor en una macro **global** accesible desde cualquier punto del código (equivalente XOne a una variable global / a `localStorage` del navegador).

### Macros de Animación

| Macro | Descripción |
|-------|-------------|
| `##ALPHA_IN##` | Fade in |
| `##ALPHA_OUT##` | Fade out |
| `##ZOOM_IN##` | Zoom de entrada |
| `##ZOOM_OUT##` | Zoom de salida |
| `##LEFT_IN##` | Entrada desde la izquierda |
| `##LEFT_OUT##` | Salida hacia la izquierda |
| `##RIGHT_IN##` | Entrada desde la derecha |
| `##RIGHT_OUT##` | Salida hacia la derecha |
| `##TOP_IN##` | Entrada desde arriba |
| `##BOTTOM_IN##` | Entrada desde abajo |
| `##PUSH_IN##` | Push desde abajo |
| `##PUSH_OUT##` | Push hacia arriba |
| `##PUSH_DOWN_IN##` | Push desde arriba |
| `##PUSH_DOWN_OUT##` | Push hacia abajo |
| `##SLIDE_DOWN_IN##` | Deslizamiento hacia abajo de entrada |
| `##SLIDE_UP_OUT##` | Deslizamiento hacia arriba de salida |
| `##ROTATE3D_IN##` | Rotación 3D entrada |
| `##ROTATE3D_OUT##` | Rotación 3D salida |

Las macros de animación se usan en tres contextos:

```xml
<!-- 1. En colecciones (transiciones de pantalla) -->
<coll name="MiPantalla" animation-in="##RIGHT_IN##" animation-out="##LEFT_OUT##">

<!-- 2. En frames (animaciones de elementos) -->
<frame name="frmPanel" animation-in="##ALPHA_IN##" animation-in-delay="250"
       animation-out="##ALPHA_OUT##" animation-out-delay="250" />

<!-- 3. En JavaScript (navegacion programatica) -->
```

```javascript
// Navegacion entre grupos con animacion
ui.showGroup(2, "##ALPHA_IN##", 500, "##ALPHA_OUT##", 500);
```

### Macros Adicionales

| Macro | Descripción |
|-------|-------------|
| `##ANY##` | Comodin para onchange (cualquier campo). Captura cambios en todos los campos |

