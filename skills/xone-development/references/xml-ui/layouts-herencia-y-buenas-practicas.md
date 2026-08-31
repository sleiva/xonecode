# XOne XML — Layouts avanzados, herencia y buenas prácticas

> Fuente: `xone/v2/xone-help-docs/topics/02d-xml-layouts-herencia.md` §9–§11. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §9 layouts: responsive con porcentajes, modales flotantes, FAB · §10 herencia entre colecciones con inherits y composición con include-layout · §11 best practices, checklist de validación XML y unicidad de nombres de nodos

---

## 9. Layouts Avanzados

### 9.1 Responsive con porcentajes

XOne no tiene media queries como CSS web, pero puedes hacer layouts adaptables usando porcentajes:

```xml
<!-- Dos columnas que se adaptan -->
<frame name="frmRow" width="100%" height="-2">
    <frame name="frmCol1" width="48%" lmargin="1%" newline="false">
        <prop name="CAMPO1" type="T" title="Campo 1" width="100%" />
    </frame>
    <frame name="frmCol2" width="48%" lmargin="2%" newline="false">
        <prop name="CAMPO2" type="T" title="Campo 2" width="100%" />
    </frame>
</frame>

<!-- Tres columnas -->
<frame name="frmRow3" width="100%" height="-2">
    <frame name="col1" width="32%" lmargin="1%" newline="false">
        <prop name="C1" type="T" title="Col 1" />
    </frame>
    <frame name="col2" width="32%" lmargin="1%" newline="false">
        <prop name="C2" type="T" title="Col 2" />
    </frame>
    <frame name="col3" width="32%" lmargin="1%" newline="false">
        <prop name="C3" type="T" title="Col 3" />
    </frame>
</frame>
```

### 9.2 Overlays y modales flotantes

Patron para mostrar un modal sobre el contenido:

```xml
<!-- Contenido principal -->
<group name="Contenido" id="1">
    <!-- ... contenido normal ... -->
    <prop name="MAP_MOSTRAR_MODAL" type="N" visible="0" />
</group>

<!-- Modal flotante -->
<group name="Modal" id="50"
       floating="true"
       top="0" left="0"
       width="100%" height="100%"
       bgcolor="#77000000"
       disablevisible="MAP_MOSTRAR_MODAL=0">
    <frame name="frmModalContent"
           width="80%" height="300p"
           lmargin="10%" tmargin="200p"
           bgcolor="#FFFFFF"
           border-corner-radius="16"
           elevation="10">
        <prop name="lblModalTitulo" type="L" visible="1"
              title="Título del Modal"
              fontbold="true" fontsize="18"
              tmargin="20p" lmargin="20p" />
        <prop name="lblModalTexto" type="L" visible="1"
              title="Contenido del modal aquí"
              fontsize="14" forecolor="#666666"
              tmargin="10p" lmargin="20p" />
        <prop name="btnCerrarModal" type="B" visible="1"
              title="Cerrar" width="80%" lmargin="10%"
              tmargin="30p"
              onclick="self.MAP_MOSTRAR_MODAL = 0; ui.refresh('MAP_MOSTRAR_MODAL');" />
    </frame>
</group>
```

También se puede lograr con un frame flotante animado (patron del wiki, EspecialChat.xne):

```xml
<frame name="frmnuevochat"
       animation-in-delay="250"
       animation-out-delay="250"
       animation-in="##RIGHT_IN##"
       animation-out="##LEFT_OUT##"
       disablevisible="MAP_VERFLOTANTE=0"
       bgcolor="#ffffff"
       modal="true"
       floating="true"
       top="0" left="0"
       width="100%" height="100%">
    <!-- Contenido del modal animado -->
</frame>
```

### 9.3 Sticky headers y footers

El patron Header + Content + Footer con grupos fijos:

```xml
<coll name="PantallaCompleta" special="true" notab="true">
    <!-- Header STICKY -->
    <group name="Header" id="10"
           fixed="true" orientation="top"
           width="100%" height="120p">
        <frame name="frmHeader" bgcolor="#1565C0"
               width="100%" height="120p" align="center|center">
            <prop name="TITULO" type="L" visible="1"
                  forecolor="#FFFFFF" fontsize="20" fontbold="true"
                  title="Mi App" />
        </frame>
    </group>

    <!-- Contenido scrollable -->
    <group name="Body" id="1">
        <frame name="frmBody" width="100%" height="100%"
               scroll="true" align="left|top">
            <!-- Todo el contenido scrollable aquí -->
        </frame>
    </group>

    <!-- Footer STICKY -->
    <group name="Footer" id="0"
           fixed="true" orientation="bottom"
           width="100%" height="80p">
        <frame name="frmFooter" bgcolor="#FFFFFF"
               width="100%" height="80p" elevation="8">
            <prop name="BTN_GUARDAR" type="B" visible="1"
                  title="Guardar" width="90%" height="56p"
                  lmargin="5%" tmargin="12p"
                  bgcolor="#4CAF50" forecolor="#FFFFFF"
                  border-corner-radius="28" />
        </frame>
    </group>
</coll>
```

### 9.4 FAB (Floating Action Button)

Botón flotante estilo Material Design:

```xml
<!-- FAB usando prop flotante -->
<prop name="MAP_FAB" type="B" visible="1"
      floating="true"
      top="1550p"
      left="850p"
      behavior="move"
      img="ic_fab.png"
      width="192p"
      height="192p" />

<!-- FAB simplificado -->
<prop name="btnNuevo" type="B" visible="7"
      class="btnFAB"
      src="./icons/ic_add.png"
      dock="bottom" align="right"
      rmargin="16p" bmargin="16p"
      onclick="crearNuevo();" />
```

El FAB también se puede crear con un frame flotante:

```xml
<frame name="floatadd1"
       top="920p" left="510p"
       width="290p" height="90p"
       floating="true">
    <prop name="BTADD1" type="B" visible="1"
          labelwidth="0"
          method="ExecuteNode(nuevo)"
          width="75p"
          img="add.png"
          imgsel="add_click.png" />
</frame>
```

### 9.5 Recycler view optimizado

Para listas con muchos registros, `recyclerview` es esencial:

```xml
<prop name="LISTA" type="Z" visible="1"
      contents="@MiLista"
      viewmode="recyclerview"
      width="100%" height="80%"
      edit-inrow="true"
      show-no-data="true"
      show-loading="true" />
```

**Tips de rendimiento**:
- Siempre usar `viewmode="recyclerview"` para listas largas.
- Limitar el número de props visibles en cada fila del content.
- Usar `loadall="true"` solo si la tabla tiene pocos registros (menos de 500).
- Usar filtros SQL eficientes con índices.
- Evitar imágenes pesadas en filas de lista.

---

## 10. Herencia entre Colecciones y Composición XML

XOne ofrece dos mecanismos **independientes del CSS** para reutilizar definiciones XML entre colecciones: herencia de coll con `inherits` y composición por inclusión de fragmentos XML con `<include-layout>`. Son distintos del sistema CSS `extends` — operan sobre la estructura XML (groups, frames, props, eventos), no sobre estilos.

### 10.1 Herencia entre colecciones con `inherits`

El atributo `inherits` en el nodo `<coll>` permite que una coleccion herede **grupos, frames, props y nodos de evento** de otra coleccion. La coleccion resultante en ejecución se comporta como una **mezcla entre la PADRE y la HIJA**.

**Sintaxis:**

```xml
<coll name="EspecialHerencia" inherits="groupsFixed" special="true" notab="false" ...>
    ...
</coll>
```

El valor de `inherits` es el `name` de otra `<coll>` del proyecto (sin extensión `.xne`).

**Regla de precedencia (importante):**

> En caso de duplicidad (mismo `name`) de `<group>`, `<frame>`, `<prop>` o nodo de evento (`<onback>`, `<before-edit>`, `<create>`, etc.), **prevalece la definición de la HIJA**. Los elementos no duplicados de la PADRE se conservan tal cual.

La hija puede además **añadir** grupos, frames, props o eventos que no existen en la padre.

**Caso de uso típico:** scaffolding visual compartido — un header fijo, un footer de paginación, botones de navegación. Se define una coll `special="true"` con toda la maquinaria común, y cada pantalla concreta la hereda.

#### Ejemplo: header y footer fijos compartidos

**Coleccion PADRE** (maquinaria reutilizable):

```xml
<coll name="groupsFixed" title="" special="true">
    <group name="HEADER" id="999" class="groupfixed_header">
        <frame name="frmtitulo" class="frmsuperior">
            <prop name="SALIR" type="B" class="btvolversuper" />
            <prop name="MENU" type="L" class="tlsuper" title="Herencia" />
            <prop name="MAP_COLORACTIVO" type="T" visible="0" />
        </frame>
    </group>
    <group name="FOOTER" id="0" class="groupfixed_footer">
        <prop name="MAP_GROUP" type="N" visible="0" />
        <prop name="MAP_TOTAL_PAGES" type="N" visible="0" />
        <frame name="FLOAT_FOOTER_FRAME" class="frmsuperior">
            <prop name="MAP_LAST" type="B" img="last.png" title="Anterior"
                  onclick="javascript:prev(self,'ir'); ui.refresh('MAP_LAST', 'MAP_NEXT', 'MAP_LAST_EMPTY');"
                  width="45%" height="80%" labelwidth="1"
                  disablevisible="MAP_GROUP=1" />
            <prop name="MAP_NEXT" type="B" img="next.png" title="Siguiente"
                  onclick="javascript:next(self,'ir'); ui.refresh('MAP_LAST', 'MAP_NEXT', 'MAP_LAST_EMPTY');"
                  width="45%" height="80%" labelwidth="1" newline="false"
                  disablevisible="MAP_GROUP=MAP_TOTAL_PAGES" />
        </frame>
    </group>
    <group name="Group1" id="1">
        <prop name="MENU2" type="L" class="classtl"
              title="Grupo heredado de la coll padre." label-wrap="true" />
    </group>
    <onback show-wait-dialog="false">
        <action name="runscript">
            <script language="javascript">
                ui.getView(self).exit();
            </script>
        </action>
    </onback>
</coll>
```

**Coleccion HIJA** (pantalla concreta que hereda la estructura):

```xml
<coll name="EspecialHerencia" inherits="groupsFixed"
      special="true" notab="false" group-swipe="true">

    <!-- Override: solo redefine MENU en el HEADER.
         SALIR y MAP_COLORACTIVO se conservan del padre. -->
    <group name="HEADER" id="999">
        <frame name="frmtitulo" class="frmsuperior">
            <prop name="MENU" type="L" class="tlsuper" title="Mi Pantalla" />
        </frame>
    </group>

    <!-- Override: Group1 queda vacio en la hija (pero se hereda el ID).
         NOTA: esto sobreescribe el MENU2 del padre al declarar el grupo. -->
    <group name="Group1" id="1">
    </group>

    <!-- Nuevo grupo: no existe en el padre, se anade -->
    <group name="Group2" id="2">
        <include-layout file="EjemploIncludeLayout.xml" group="2" />
    </group>

    <!-- Evento propio de la hija (no conflicta con el padre) -->
    <before-edit>
        <action name="runscript">
            <script language="javascript">
                self.MAP_GROUP = 1;
                self.MAP_TOTAL_PAGES = 2;
            </script>
        </action>
    </before-edit>
</coll>
```

#### Cadenas de herencia (A → B → C)

`inherits` soporta **cadenas**: una coll B puede heredar de A, y una C puede heredar de B. La resolución recorre toda la cadena hacia arriba y aplica la regla hijo-gana en cada nivel.

```xml
<coll name="BaseLayout" special="true"> ... </coll>
<coll name="LayoutConMenu" inherits="BaseLayout" special="true"> ... </coll>
<coll name="PantallaFinal" inherits="LayoutConMenu"> ... </coll>
```

`PantallaFinal` recibe: definiciones de `BaseLayout` + lo que `LayoutConMenu` sobreescriba o añada + lo que `PantallaFinal` sobreescriba o añada.

#### Herencia multiple: NO soportada

Solo se admite **un padre** por coll. No existe la sintaxis `inherits="A,B"` ni similares. Si necesitas combinar piezas de varias fuentes, usa `<include-layout>` (sección 10.2) para factorizar fragmentos.

#### Eventos heredados

Los nodos de evento a nivel de coll (`<onback>`, `<before-edit>`, `<create>`, `<after-edit>`, `<onchange>`, custom nodes, etc.) también se heredan. Aplica la misma regla:
- Si el evento no esta en la hija, se ejecuta el del padre.
- Si la hija define el mismo evento, se ejecuta el de la hija (sobreescribe completamente; **no hay concepto de `super()`** que llame al del padre).

#### Cuando usar `inherits`

| Escenario | Recomendacion |
|-----------|---------------|
| Varias pantallas comparten header/footer/navegación | SI usar `inherits` con coll padre `special="true"` |
| Dos pantallas muy parecidas pero con lógica distinta | Normalmente SI — override de eventos en la hija |
| Pantallas totalmente distintas | NO — la herencia no aporta |
| Colecciones de datos (con `objname`) | Raro. `inherits` es útil sobre todo en colecciones de UI (`special="true"`) |

### 10.2 Composición con `<include-layout>`

`<include-layout>` es un nodo que **inyecta el contenido de un fichero XML externo** en el punto donde aparece. Se usa para factorizar fragmentos reutilizables (botoneras, bloques de props, eventos compartidos).

**Sintaxis:**

```xml
<include-layout file="MisBotones.xml" group="1" frame="todo" />
```

| Atributo | Obligatorio | Descripción |
|----------|-------------|-------------|
| `file` | Si | Ruta al fichero XML a incluir. **Relativa a la raiz del proyecto**. |
| `group` | No | ID de grupo por defecto para los `<prop>` del fichero incluido que NO declaren `group`. |
| `frame` | No | Nombre de frame por defecto para los `<prop>` del fichero incluido que NO declaren `frame`. |

#### Formato del fichero incluido

El fichero referenciado por `file=` debe cumplir una estructura especifica:

- **Cabecera XML** con encoding `utf-8`: `<?xml versión="1.0" encoding="utf-8"?>`
- **Raiz `<xml>`** (NO `<coll>`).
- **Estructura plana (no jerárquica)** al nivel de la raiz: los nodos (`<prop>`, `<group>`, `<frame>`, eventos custom) van todos al mismo nivel dentro de `<xml>`.

Puede contener `<prop>`, `<group>`, `<frame>` y nodos de evento (incluyendo eventos custom como `<salir>`, `<guardar>`, etc., invocables con `method="ExecuteNode(nombre)"`).

**Ejemplo de fichero incluido — `MisBotones.xml`:**

```xml
<?xml version="1.0" encoding="utf-8"?>
<xml>
    <prop name="MAP_SALIR" type="B" title="Salir" visible="1"
          method="ExecuteNode(salir)"
          width="100%" height="20%" labelwidth="10" tmargin="0" />

    <salir refresh="false">
        <action name="runscript" type="runscript">
            <script language="javascript">
                appData.exit();
            </script>
        </action>
    </salir>
</xml>
```

#### Ejemplo de uso en una coll

```xml
<coll name="MenuEntrada" special="true" notab="true">
    <group name="General" id="1" />
    <frame name="todo" width="100%" height="100%" scroll="true" />

    <prop group="1" frame="todo" name="MAP_TEXTO_01" type="T" title="Texto #1"
          visible="1" labelwidth="10" width="100%" />
    <prop group="1" frame="todo" name="MAP_TEXTO_02" type="T" title="Texto #2"
          visible="1" labelwidth="10" width="100%" />
    <prop group="1" frame="todo" name="MAP_TEXTO_03" type="T" title="Texto #3"
          visible="1" labelwidth="10" width="100%" />

    <!-- Se inyecta aquí el contenido de MisBotones.xml.
         Los props del fichero sin group/frame tomaran group="1" frame="todo" -->
    <include-layout file="MisBotones.xml" group="1" frame="todo" />

    <prop group="1" frame="todo" name="MAP_TEXTO_04" type="T" title="Texto #4"
          visible="1" labelwidth="10" width="100%" />
    <prop group="1" frame="todo" name="MAP_TEXTO_05" type="T" title="Texto #5"
          visible="1" labelwidth="10" width="100%" />
</coll>
```

#### Semantica de `group` y `frame` en `<include-layout>`

Los atributos `group` y `frame` del nodo `<include-layout>` **solo actuan como valores por defecto** para los props del fichero incluido que NO declaren explicitamente `group` o `frame`. Si un prop del fichero incluido ya declara esos atributos, prevalece lo declarado.

Esto permite que el mismo fichero `MisBotones.xml` se incluya desde distintas colls y se ubique automáticamente en el grupo/frame correctos.

#### Limitaciones

- **No se pueden anidar `<include-layout>`**: el fichero incluido NO puede contener a su vez otro `<include-layout>`. La inclusión es un solo nivel.
- **No sustituye a `inherits`**: `<include-layout>` es **composición** (pegar fragmentos), no herencia. No hay concepto de override — si el fichero incluido define un `name` que ya existe en la coll, es error de modelo del desarrollador (duplicidad de nombres prohibida dentro de la misma coll).
- **Ruta relativa a la raiz del proyecto**, no a la carpeta de la coll.

### 10.3 Combinar `inherits` + `<include-layout>`

Los dos mecanismos se combinan con normalidad. El patron más potente es:

1. Una coll padre `special="true"` que defina la estructura visual base (headers, footers, navegación) — reutilizada via `inherits`.
2. Ficheros XML factorizados (botoneras, fragmentos de formulario) reutilizados via `<include-layout>` dentro de cada pantalla concreta.

```xml
<coll name="PantallaA" inherits="groupsFixed" special="true">
    <group name="Group2" id="2">
        <include-layout file="ControlesGpsComunes.xml" group="2" frame="frmMapa" />
    </group>
</coll>
```

### 10.4 Diferencia con el CSS `extends`

No confundir estos mecanismos con la herencia CSS (`extends:` dentro de `.css`). Actuan en niveles distintos:

| Aspecto | `extends` (CSS) | `inherits` (coll XML) | `<include-layout>` (nodo XML) |
|---------|-----------------|------------------------|-------------------------------|
| Nivel | Estilos | Estructura de coll | Fragmento XML |
| Que aporta | Atributos visuales | groups, frames, props y eventos completos | Nodos predefinidos en fichero externo |
| Duplicidad | Hija sobrescribe atributos | Hija sobrescribe nodos con mismo `name` | No aplica (no hay resolución de duplicados) |
| Cadenas | Si (A→B→C) | Si (A→B→C) | No (un solo nivel) |
| Multiple | No | No | — |
| Sintaxis | `extends: .base;` | `inherits="ColPadre"` | `<include-layout file="..." />` |
| Donde vive | `.css` | Atributo en `<coll>` | Nodo XML dentro de `<coll>` |

### 10.5 Anti-patrones

| Error | Consecuencia |
|-------|--------------|
| Usar `inherits` entre colecciones de datos con `objname` distintos sin planificarlo | Confusion de modelo: la hija puede heredar eventos o campos que no aplican a su tabla |
| Cadenas de `inherits` muy largas (>3-4 niveles) | Difícil de depurar: para saber que tiene realmente una coll hay que recorrer toda la cadena |
| Crear una padre gigante que todo el mundo hereda «por si acaso» | Se arrastran nodos innecesarios a cada pantalla. Mejor varias padres pequeñas y especificas |
| Usar `<include-layout>` con ficheros anidados | No soportado: el fichero incluido no puede contener otro `<include-layout>` |
| Poner encoding `iso-8859-1` o `iso-8859-15` en el fichero de `<include-layout>` | Limita los caracteres admitidos. Usar **`utf-8`** en los ficheros incluidos (los `.xne` pueden ir en UTF-8 o iso-8859-15) |
| Declarar `<coll>` como raiz en el fichero de `<include-layout>` | Formato incorrecto: la raiz debe ser `<xml>`, no `<coll>` |
| Repetir un `name` entre coll y fichero incluido | Los nombres de props/groups/frames deben ser únicos en el ambito final tras la composición |

---

## 11. Best Practices y Anti-patrones

### 11.1 Top 15 buenas prácticas XML

1. **Nombres en PascalCase para colecciones**: `MenuPrincipal`, `DetalleCliente`.
2. **Nombres en camelCase para props de UI**: `btnGuardar`, `lblTitulo`, `txtNombre`.
3. **MAYUSCULAS para campos de BD**: `NOMBRE`, `DIRECCION`, `FECHA_CREACION`.
4. **Prefijo `MAP_` para campos temporales**: `MAP_FILTRO`, `MAP_SELECCIONADO`.
5. **Prefijo `frm` para frames**: `frmHeader`, `frmBody`, `frmCard`.
6. **`##PREF##` en todas las consultas SQL**: Nunca hardcodear el nombre de tabla.
7. **`visible="0"` para campos internos**: Campos de control que no se muestran.
8. **`visible="7"` por defecto**: Para campos que deben verse en todos los contextos.
9. **Un archivo `.xne` por coleccion**: Salvo `mappings.xne` (ver Tópico 01 - Estructura).
10. **Comentarios XML explicativos**: Documentar cada sección importante.
11. **Usar clases CSS en lugar de estilos inline**: Para reutilización (ver Tópico 04).
12. **Event handlers con nombres descriptivos**: `guardar`, `buscar`, `irAlDetalle`.
13. **`method="executenode()"` para lógica compleja**: No poner código extenso en `onclick`.
14. **Porcentajes para anchos**: Mejor adaptacion a diferentes pantallas.
15. **`height="-2"` para contenido dinámico**: Evita alturas fijas innecesarias.

### 11.2 Top 10 anti-patrones a evitar

1. **Inventar atributos XML**: Si no esta en la documentación, no existe. XOne los ignora silenciosamente.
2. **Usar `px` como unidad**: XOne usa `p` (puntos) y `%`, no `px`, `em`, `rem`.
3. **Mezclar `onclick` y `method`**: Usar uno u otro en el mismo prop, nunca ambos.
4. **Poner lógica compleja en `onclick`**: Mejor usar `method="executenode(nombre)"` y un nodo aparte.
5. **Olvidar `newline="false"`**: Los elementos son `newline="true"` por defecto. Si quieres columnas, debes especificarlo.
6. **Exceso de anidamiento**: Más de 4-5 niveles de frames anidados degrada el rendimiento.
7. **`loadall="true"` en tablas grandes**: Puede bloquear la aplicación al cargar miles de registros.
8. **Contents sin prefijo `@`**: El content no se vincula correctamente al prop.
9. **Combinar `special="true"` con consultas SQL**: Son mutuamente excluyentes.
10. **Usar CSS web estándar**: XOne tiene su propio CSS propietario. Ver Tópico 04.
11. **Usar APIs del DOM**: XOne no es HTML y no tiene navegador. Las funciones `document`, `document.getElementById`, `document.querySelector`, `window`, `localStorage`, `sessionStorage`, `XMLHttpRequest`, `navigator`, `history` NO existen en XOne. Para HTTP idiomático usar `$http`; para navegación `ui.*`; para datos `self.*` y `appData.*`. (SÍ existen, vía implementación custom: `fetch`, `Promise` ES2024, `setTimeout`/`setInterval`, `URL`, `Headers`, `AbortController`, `EventTarget`, `console`, `performance.now()`.)
12. **Repetir nombres de nodos dentro de la misma coleccion**: Ver sección 11.4 abajo — es una restricción crítica de la plataforma.
13. **Crear un evento como nodo XML cuando es atributo**: Los eventos de control (`onclick`, `ontextchanged`, `onfocuschanged`, `oneditoraction`, `onlongpress`, `onlongpressitem`, `onscroll`, `onconsolemessage`, `oncodescanned`, `ondateselected`, `onpageselected`, `ondraweropened`, `ondrawerclosed`, etc.) se declaran SIEMPRE como atributos del `<prop>`/`<frame>`/`<coll>` y su valor es JS inline. NO existen como nodos XML hijos: `<onconsolemessage>...</onconsolemessage>` o `<onclick>...</onclick>` son XML invalidos que XOne ignora silenciosamente. Excepción documentada: `onchange` admite ambas formas (ver §3.2 del Tópico 05) — es la unica. Los nodos hijos de `<coll>` que SI existen son eventos de objeto/coleccion (`<create>`, `<load>`, `<before-edit>`, `<after-edit>`, `<onback>`, `<onrefresh>`, `<login-ok>`, `<login-fail>`, etc.), no eventos de control.

### 11.3 Checklist de validación XML

Antes de entregar código XML, verifica:

**Estructura general:**
- [ ] Declaración XML con encoding coherente (UTF-8 o iso-8859-15): `<?xml version="1.0" encoding="utf-8"?>`
- [ ] Nodo raiz `<coll>` con atributo `name`
- [ ] Al menos un `<group>` con `name` e `id`
- [ ] Todos los IDs de grupo son únicos
- [ ] No hay dos nodos del mismo tipo con el mismo `name` dentro de la misma `<coll>` (ver 11.4)
- [ ] No hay dos `<coll>` con el mismo `name` en el proyecto

**Nodo coll:**
- [ ] `name` en PascalCase
- [ ] Si tiene datos: `sql`, `objname`, `updateobj` definidos
- [ ] Si es pantalla: `special="true"` y sin `sql`
- [ ] SQL usa `##PREF##`
- [ ] `notab="true"` si solo hay un grupo visible

**Nodos prop:**
- [ ] Todos tienen `name` y `type`
- [ ] `type` es un valor valido de la tabla de tipos
- [ ] `visible` usa el bitmask correcto (0-7)
- [ ] Los botones usan `method` O `onclick`, no ambos
- [ ] Los combos tienen `mapcol`/`mapfld` en el prop oculto y `linkedto`/`linkedfield` en el visible
- [ ] Los `type="Z"` tienen un `<contents>` correspondiente

**Nodos frame:**
- [ ] Todos tienen `name`
- [ ] Los frames horizontales usan `newline="false"`
- [ ] Las dimensiones usan `p` o `%`, nunca `px`
- [ ] Los frames flotantes tienen `floating="true"` con `top`/`left`

**Event handlers:**
- [ ] `<create>`, `<load>`, `<onback>` son hijos de `<coll>`
- [ ] Los nodos custom tienen la estructura: `<action name="runscript"><script>...</script></action>`
- [ ] Los parámetros se declaran con `<param name="..." />`
- [ ] Las condiciones XML usan `&gt;` para `>` y `&lt;` para `<`

**Contents:**
- [ ] Los `<contents>` tienen `name` (con `@`) y `src`
- [ ] Los filtros usan `##FLD_CAMPO##` para valores dinámicos
- [ ] Cada content esta vinculado a un `<prop type="Z">`
- [ ] Todos los nodos con `name` tienen nombres únicos en su ambito (ver 11.4)

### 11.4 Restricción crítica: unicidad de nombres de nodos

**Esta es una restricción de la plataforma XOne, no una sugerencia.**

Dentro de una `<coll>`, todos los nodos que tengan atributo `name` deben tener nombres únicos. **El ambito de unicidad es la `<coll>` ENTERA**, no el `<group>` o `<frame>` que contiene al nodo: dos elementos del mismo tipo no pueden tener el mismo `name` en ningun lugar de la misma coll, **ni siquiera si están en `<group>` o `<frame>` distintos**.

Casos prohibidos:

- **Dos `<group>` con el mismo `name`** dentro de la misma `<coll>` — prohibido
- **Dos `<frame>` con el mismo `name`** dentro de la misma `<coll>` — prohibido (incluso aunque estén en `<group>` distintos)
- **Dos `<prop>` con el mismo `name`** dentro de la misma `<coll>` — prohibido (incluso aunque estén en `<group>` o `<frame>` distintos)
- **Dos eventos del mismo tipo** (ej. dos `<before-edit>`) dentro de la misma `<coll>` — prohibido
- **Dos `<coll>` con el mismo `name`** en el mismo proyecto — prohibido

**Razón técnica:** el `name` de cada nodo se publica a nivel de la propia `<coll>` (los `collprops`), por lo que actuaria como identificador único ambiguo si se repitiera. La unicidad se evalua sobre la coll completa, no sobre el padre inmediato.

**Lo que SI es valido:** dos `<coll>` distintas (distinto `name`) con el contenido exactamente igual — incluso con los mismos `name` internos de prop/group/frame. Cada coll es un ambito independiente. La unicidad aplica al nombre del nodo dentro de su coll, no al contenido en si.

```xml
<!-- INCORRECTO: dos group con el mismo name -->
<coll name="MiPantalla" special="true">
    <group name="grpPrincipal" id="1">...</group>
    <group name="grpPrincipal" id="2">...</group>  <!-- ERROR: nombre duplicado -->
</coll>

<!-- INCORRECTO: dos prop con el mismo name -->
<group name="grpDatos" id="1">
    <prop name="NOMBRE" type="T" visible="7"/>
    <prop name="NOMBRE" type="L" visible="2"/>  <!-- ERROR: nombre duplicado -->
</group>

<!-- INCORRECTO: dos before-edit en la misma coll -->
<coll name="MiPantalla" special="true">
    <before-edit>...</before-edit>
    <before-edit>...</before-edit>  <!-- ERROR: evento duplicado -->
</coll>

<!-- CORRECTO: nombres distintos en todos los nodos -->
<coll name="MiPantalla" special="true">
    <before-edit>...</before-edit>
    <group name="grpPrincipal" id="1">
        <frame name="frmHeader" width="100%" height="100p"/>
        <frame name="frmBody" width="100%" height="-2"/>   <!-- nombres distintos -->
        <prop name="MAP_TITULO" type="L" visible="7"/>
        <prop name="MAP_SUBTITULO" type="L" visible="7"/> <!-- nombres distintos -->
    </group>
    <group name="grpSecundario" id="2">...</group>         <!-- nombre distinto -->
</coll>

<!-- CORRECTO: dos coll distintas con contenido identico -->
<coll name="ColeccionA" progid="ASData.CASBasicDataObj" ...>
    <group name="General" id="1">
        <prop name="NOMBRE" type="T" visible="7"/>
    </group>
</coll>
<coll name="ColeccionB" progid="ASData.CASBasicDataObj" ...>  <!-- distinto name: valido -->
    <group name="General" id="1">
        <prop name="NOMBRE" type="T" visible="7"/>
    </group>
</coll>
```

**Estrategia para evitar colisiones al generar código:** usa prefijos que incluyan el contexto funcional del elemento:

```xml
<!-- En lugar de nombres genericos reutilizables en varias pantallas: -->
<frame name="frmContenido">  <!-- RIESGO de colision si otro grupo tiene el mismo nombre -->

<!-- Usa nombres especificos que describan su funcion: -->
<frame name="frmClienteHeader">
<frame name="frmClienteBody">
<frame name="frmClienteFooter">
```

> **Referencia cruzada**: Para más información sobre estructura de proyecto consulta el Tópico 01 - Estructura del Proyecto. Para estilos CSS, consulta el Tópico 04 - CSS. Para la API JavaScript, consulta el Tópico 03 - JavaScript. Para crear un proyecto desde cero, consulta el Tópico 01 - Fundamentos.

