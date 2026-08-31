# XOne — FAQ por área

> Fuente: `xone/v2/xone-help-docs/topics/05-events-patterns-faq.md` §14–§18. Referencia de la skill; el índice está en [../SKILL.md](../SKILL.md).

Contenido: §14 FAQ general · §15 FAQ XML/UI · §16 FAQ JavaScript · §17 FAQ CSS · §18 FAQ estructura de proyecto

---

## 14. FAQ General

### Que es XOne?

XOne es una plataforma de desarrollo de aplicaciones móviles que permite crear apps nativas para Android e iOS desde un único código base. Utiliza archivos XML (.xne) para definir la interfaz, JavaScript para la lógica de negocio y un CSS propietario para los estilos.

### Es XOne multiplataforma?

Si. XOne genera aplicaciones nativas para Android e iOS a partir del mismo código XML, JavaScript y CSS. No es una solución hibrida basada en WebView - genera UIs nativas.

### Necesito saber Java/Swift?

No. XOne abstrae la capa nativa mediante su propio sistema de XML + JavaScript + CSS. Solo necesitas conocer estos tres lenguajes en su variante XOne. Sin embargo, se pueden crear extensiones nativas en la carpeta `native/` si se necesita funcionalidad especifica de la plataforma.

### Como funciona la sincronización?

XOne incluye un sistema de replica integrado que sincroniza datos entre el dispositivo móvil y un servidor. Se configura en el nodo `<maintenance>` de la coleccion `Empresas` en `mappings.xne`. Los datos locales se almacenan en SQLite y se sincronizan según la frecuencia configurada.

### Que base de datos usa XOne?

XOne usa SQLite como base de datos local en el dispositivo. El archivo de base de datos (`gestion.db`) se almacena en la carpeta `bd/` del proyecto. Las tablas se generan automáticamente a partir de las definiciones en los archivos `.xne`.

---

## 15. FAQ XML/UI

### Como hago un layout responsive?

Usa porcentajes para anchos y altos, y puntos (`p`) para margenes y tamaños fijos:

```xml
<frame name="frmResponsive" width="100%" height="auto">
    <prop name="campo1" type="T" width="48%" height="56p"/>
    <prop name="campo2" type="T" width="48%" height="56p" newline="false"/>
</frame>
```

### Como creo un menu con tarjetas?

Ver la sección [9.3 Menu con tarjetas](#93-menu-con-tarjetas) en los patrones de navegación.

### Como oculto/muestro elementos condicionalmente?

Usa el atributo `disablevisible`:

```xml
<!-- Se oculta cuando MAP_MOSTRAR vale 0 -->
<prop name="lblInfo" type="L" disablevisible="MAP_MOSTRAR=0" title="Info"/>

<!-- Se oculta cuando MAP_ESTADO no es ACTIVO -->
<frame name="frmActivo" disablevisible="MAP_ESTADO<>'ACTIVO'">
    <!-- contenido -->
</frame>
```

### Como creo una lista con recyclerview?

```xml
<prop name="@miLista" type="Z" contents="miLista"
      viewmode="recyclerview" width="100%" height="70%"/>
<contents name="miLista" src="MiColeccionDatos"/>
```

### Como hago un combo/selector?

```xml
<!-- Con valores estaticos -->
<prop name="MAP_COMBO_ID" type="T" visible="0"
      mapcol-values="Opcion1, Opcion2, Opcion3" mapfld="DATA"/>
<prop name="COMBO" type="T" visible="1" title="Seleccionar"
      showinline="true" linkedto="MAP_COMBO_ID" linkedfield="DATA"/>

<!-- Con datos de coleccion -->
<prop name="MAP_COMBO_ID2" type="N" visible="0"
      mapcol="MiColeccion" mapfld="ID"/>
<prop name="COMBO2" type="T" visible="1" title="Seleccionar"
      linkedto="MAP_COMBO_ID2" linkedfield="NOMBRE"/>
```

> **Referencia cruzada:** Para más detalles sobre combos y selectores, consultar el tópico 02 sobre estructura XML.

### Como pongo dos elementos en la misma linea?

Usa `newline="false"` en el segundo elemento:

```xml
<prop name="campo1" type="T" width="48%" height="56p"/>
<prop name="campo2" type="T" width="48%" height="56p" newline="false"/>
```

### Como creo un header fijo?

Usa un `<group>` con `class="groupfixed_header"` y `id="10"` (o un id alto):

```xml
<group name="HEADER" id="10" class="groupfixed_header">
    <frame name="frmtitulo" class="frmsuperior">
        <prop name="SALIR" type="B" class="btvolversuper"/>
        <prop name="MENU" type="L" class="tlsuper" title="MI PANTALLA"/>
    </frame>
</group>
```

### Que es visible="7" y por que no visible="true"?

El atributo `visible` usa un bitmask (mascara de bits):

| Valor | Significado |
|-------|-------------|
| `0` | Oculto en todos los modos |
| `1` | Solo en modo edición |
| `2` | Solo en modo lista |
| `4` | Solo en contents (filas) |
| `7` | Visible en todos los modos (1+2+4) |

Por eso `visible="7"` equivale a "siempre visible" y no se usa `true`/`false`.

> **Referencia cruzada:** Para la tabla completa de visibilidad, consultar el tópico 02.

### Como hago un campo de solo lectura?

```xml
<prop name="MAP_NOMBRE" type="T" locked="true" title="Nombre"/>
```

### Diferencia entre onclick y method?

- **`onclick`**: Ejecuta JavaScript directamente. Accede al objeto evento `e`.
- **`method`**: Invoca un nodo de evento definido en la coleccion mediante `ExecuteNode()`.

```xml
<!-- onclick: JS directo -->
<prop name="btn1" type="B" onclick="javascript:miFuncion();"/>

<!-- method: invoca nodo -->
<prop name="btn2" type="B" method="ExecuteNode(miNodo)"/>
```

---

## 16. FAQ JavaScript

### Como accedo a un campo del formulario?

```javascript
// Leer
var nombre = self.MAP_NOMBRE;
var precio = self.MAP_PRECIO;

// Escribir
self.MAP_NOMBRE = "Nuevo valor";
self.MAP_PRECIO = 29.99;

// Acceso dinámico
var campo = "MAP_NOMBRE";
var valor = self[campo];
```

### Como navego a otra pantalla?

```javascript
// Abrir una pantalla (la forma habitual — abre el EditView de un objeto nuevo
// de la coll destino: XOne hace createObject + addItem internamente)
ui.openEditView("NombreColeccion");

// Abrir un objeto EXISTENTE (o uno preparado con propiedades) en edicion
ui.openEditView(objeto);

// Cerrar pantalla actual
ui.getView(self).exit();

// Salir de la app
appData.exit();
```

### Como paso datos entre pantallas?

**Patrón canónico — dataObject + `ui.openEditView()`:** preparar el objeto de la coll destino con los valores deseados y abrirlo en edición.

```javascript
var coll = appData.getCollection("OtraPantalla");
var obj = new OtraPantalla({ MAP_DATO_RECIBIDO: "valor" });
coll.addItem(obj);
ui.openEditView(obj);
```

**Alternativas para datos globales / de sesión** (no para "abrir pantalla con datos"):

```javascript
// Variables en la empresa actual
appData.getCurrentEnterprise().setVariable("MI_DATO", "valor");
var dato = appData.getCurrentEnterprise().getVariable("MI_DATO");

// Macros globales (clave-valor de toda la app)
appData.setGlobalMacro("##MI_MACRO##", "valor");
var dato = appData.getGlobalMacro("##MI_MACRO##");
```

> **Referencia cruzada:** Para la API completa de navegación, consultar el tópico 03.

### Como filtro una coleccion?

```javascript
var coll = self.getContents("miContent");
coll.setFilter("ACTIVO = 1 AND TIPO = 'A'");
coll.clear();
coll.loadAll();
ui.refresh("@miContent");
```

### Como recorro los items de una coleccion?

```javascript
var coll = appData.getCollection("MiColeccion");
coll.loadAll();
var total = coll.getCount();
for (var i = 0; i < total; i++) {
    var item = coll.get(i);
    console.log(item.NOMBRE + " - " + item.PRECIO);
}
```

### Como hago una llamada HTTP?

```javascript
var miObjeto = self; // Guardar contexto
var request = {
    headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
    },
    data: {
        nombre: "Juan",
        email: "juan@ejemplo.com"
    }
};

$http.post("https://api.ejemplo.com/usuarios", request,
    function(sData, headers, nHttpStatusCode) {
        var resultado = JSON.parse(sData);
        miObjeto.MAP_RESULTADO = resultado.id;
        ui.refresh("MAP_RESULTADO");
    },
    function(nError, sErrorDesc) {
        ui.showToast("Error: " + sErrorDesc);
    }
);
```

### Como obtengo la ubicación GPS?

```javascript
ui.startGps();
var lat = ui.getGpsLatitude();
var lng = ui.getGpsLongitude();
```

O con callback:

```javascript
ui.startGps({
    nodeName: "callbackGPS",
    timeBetweenUpdates: 10000
});
```

### Como tomo una foto?

Usa un `<prop>` de tipo `PH`:

```xml
<prop name="MAP_FOTO" type="PH" height="40%" title="Foto"/>
```

La foto se captura automáticamente al tocar el control. El valor del campo sera el nombre del archivo generado.

### Como ejecuto un evento custom?

```javascript
// Desde JavaScript
self.executeNode("miEvento");

// Con parametros
self.executeNode("miEvento", "parametro1");
```

### Como refresco la pantalla?

```javascript
// Refrescar todo
ui.refresh();

// Refrescar campos especificos
ui.refresh("MAP_NOMBRE,MAP_PRECIO");

// Refrescar solo el valor (sin reconstruir)
ui.refreshValue("MAP_CAMPO");

// Refrescar un content
ui.refresh("@miContent");

// Refrescar un frame y sus hijos
ui.getView(self).refreshAll("frmMiFrame");

// Refrescar fila de content
ui.refreshContentRow("CONTENT_PROP", indice);
```

### Como muestro un mensaje al usuario?

```javascript
// Toast simple
ui.showToast("Mensaje rápido");

// Dialogo OK
ui.msgBox("Mensaje", "Título", 0);

// Dialogo Si/No
var respuesta = ui.msgBox("Desea continuar?", "Confirmar", 4);
if (respuesta == 6) {
    // Pulso Si
}

// Toast personalizado
ui.showToast({
    color: "#4CAF50",
    text: "Exito!",
    textColor: "#FFFFFF",
    duration: "short"
});
```

---

## 17. FAQ CSS

### Por que no funcionan px, em, rem?

El CSS de XOne no es CSS web estándar. Usa su propio sistema de unidades y no reconoce `px`, `em`, `rem`, `vh`, `vw` ni ninguna unidad CSS web.

### Que unidades uso?

| Unidad | Descripción | Ejemplo |
|--------|-------------|---------|
| `p` | Puntos (unidad fija) | `width:200p;` |
| `%` | Porcentaje del contenedor padre | `width:50%;` |
| (sin unidad) | Número entero para ciertos atributos | `fontsize:14;` |

> **Referencia cruzada:** Para la guía completa de CSS XOne, consultar el tópico 04.

### Como aplico multiples clases?

Separar con espacios:

```xml
<prop name="campo" type="T" class="mClassT alineacion color"/>
```

```css
.mClassT {
    width:90%;
    height:50p;
}
.alineacion {
    text-align:center;
}
.color {
    forecolor:#FF0000;
}
```

### Como hago herencia CSS con extends?

```css
.clasePadre {
    width:90%;
    height:50p;
    fontsize:14;
}

.claseHija {
    extends:.clasePadre;
    forecolor:#FF0000;
}
```

### Como reutilizo el header/footer en varias pantallas?

Con el atributo `inherits` a nivel de `<coll>`. Defines una coll `special="true"` que contenga la estructura común (grupos `HEADER` y `FOOTER`, eventos `<onback>`, etc.), y cada pantalla concreta la hereda.

```xml
<!-- Coll padre reutilizable -->
<coll name="layoutsFijos" special="true">
    <group name="HEADER" id="999" class="groupfixed_header">
        <!-- Header comun a todas las pantallas -->
    </group>
    <group name="FOOTER" id="0" class="groupfixed_footer">
        <!-- Footer comun -->
    </group>
</coll>

<!-- Pantalla concreta que hereda -->
<coll name="MiPantalla" inherits="layoutsFijos" special="true">
    <!-- HEADER y FOOTER se heredan automaticamente.
         Solo se declara lo específico de esta pantalla -->
    <group name="Group1" id="1">
        <!-- Contenido propio de MiPantalla -->
    </group>
</coll>
```

La hija puede sobrescribir grupos/frames/props del padre declarandolos con el mismo `name`. Todo lo que no declare se hereda tal cual.

### Como incluyo un fragmento XML desde otro fichero?

Con el nodo `<include-layout>`. Útil para factorizar botoneras, bloques de props o eventos que se repiten.

```xml
<!-- Dentro de una coll -->
<coll name="MiPantalla" ...>
    <group name="General" id="1" />
    <frame name="todo" width="100%" height="100%" />

    <prop group="1" frame="todo" name="MAP_CAMPO1" type="T" visible="1" />
    <include-layout file="MisBotones.xml" group="1" frame="todo" />
    <prop group="1" frame="todo" name="MAP_CAMPO2" type="T" visible="1" />
</coll>
```

El fichero `MisBotones.xml` debe tener raiz `<xml>` y estructura plana:

```xml
<?xml version="1.0" encoding="utf-8"?>
<xml>
    <prop name="MAP_SALIR" type="B" title="Salir"
          method="ExecuteNode(salir)" width="100%" />
    <salir refresh="false">
        <action name="runscript">
            <script language="javascript">
                appData.exit();
            </script>
        </action>
    </salir>
</xml>
```

Los atributos `group` y `frame` del `<include-layout>` actuan como defaults para los props del fichero incluido que no los declaren. La ruta del `file` es relativa a la raiz del proyecto.

### Que diferencia hay entre `extends` (CSS) e `inherits` (coll)?

Actuan en niveles completamente distintos:

- **`extends`** (CSS) vive en archivos `.css` y hace que una clase herede atributos visuales de otra. Solo afecta a estilos.
- **`inherits`** (XML) es un atributo de `<coll>` en un `.xne` y hace que una coleccion herede la estructura completa (groups, frames, props y eventos) de otra coleccion.

Son compatibles: puedes usar los dos al mismo tiempo — una coll puede hacer `inherits` de otra, y sus props usar clases CSS que a su vez hacen `extends`.

### Como pongo transparencia en colores?

Usa el formato `#AARRGGBB` donde `AA` es el valor alfa (00=transparente, FF=opaco):

```css
.fondoSemiTransparente {
    bgcolor:#80000000;  /* Negro con 50% de transparencia */
}

.fondoTransparente {
    bgcolor:#00000000;  /* Completamente transparente */
}
```

---

## 18. FAQ Estructura

### Que va en mappings.xne?

Solo las colecciones `Empresas` y `Usuarios`. Todas las demas colecciones van en archivos `.xne` separados.

```xml
<!-- mappings.xne - SOLO Empresas y Usuarios -->
<coll name="Empresas">
    <prop name="CODIGO" type="N"/>
    <prop name="NOMBRE" type="T" fieldsize="100"/>

    <onlogon>...</onlogon>
    <maintenance>...</maintenance>
</coll>

<coll name="Usuarios">
    <prop name="CODIGO" type="N"/>
    <prop name="NOMBRE" type="T" fieldsize="100"/>
    <prop name="IDEMPRESA" type="N" mapcol="Empresas" mapfld="ID"/>
    <prop name="LOGIN" type="T" fieldsize="50"/>
    <prop name="PWD" type="X" fieldsize="100"/>
</coll>
```

### Donde pongo mis colecciones adicionales?

Cada coleccion adicional va en su propio archivo `.xne` en la raiz del proyecto:

```
MiProyecto/
  mappings.xne          <- Solo Empresas y Usuarios
  EntradaApp.xne        <- Pantalla de entrada
  MenuPrincipal.xne     <- Menu principal
  Productos.xne         <- Coleccion de productos
  DetalleProducto.xne   <- Pantalla de detalle
  ...
```

### Este proyecto tiene ficheros `.xml` además de los `.xne`, ¿los toco?

**No.** Los ficheros `.xml` de colecciones/pantallas son **artefactos generados automáticamente por XOneStudio** a partir del `.xne` correspondiente. Existen porque algunos motores de ejecución del framework aún leen `.xml`, pero se regeneran solos cada vez que XOneStudio procesa el proyecto.

Regla operativa: **solo se trabaja con `.xne`**. Si editas un `.xml` a mano, tu cambio se perdera la proxima vez que XOneStudio regenere el proyecto. Si quieres modificar el comportamiento, modifica el `.xne` correspondiente.

Excepciones:
- `app.xml` (configuración global de la aplicación) SI es fuente: el programador lo edita directamente. No tiene un `.xne` que lo genere.

Horizonte de futuro: el plan es que los `.xml` generados desaparezcan y todo el proyecto quede solo en `.xne`. El trabajo con IA ya se comporta como si esos `.xml` no existieran.

### Por que necesito ROWID en Empresas y Usuarios?

El campo `ROWID` almacena un GUID (identificador único global) de 32 caracteres sin guiones. Es necesario para el sistema de replica/sincronización de XOne, que identifica cada registro de forma única entre dispositivos.

```xml
```

### Como se genera la base de datos?

La base de datos se genera con la herramienta `xone-db-tools`:

```bash
npm install -g xone-db-tools
xone-db-tools create-db templates/synthetic_samples/MiProyecto --overwrite
```

Esto analiza todos los archivos `.xne` y crea las tablas correspondientes en `bd/gestion.db` con prefijo `gen_`, nombres de tabla en minúsculas y campos en mayúsculas.

### Donde pongo las imágenes?

- **`icons/`** - Iconos y recursos estáticos (PNG, JPG, SVG)
- **`files/`** - Archivos dinámicos generados por la app (fotos, firmas, documentos)

### Que formato de iconos usa XOne?

**PNG, JPG y SVG**. XOne soporta los tres formatos para iconos y recursos gráficos. El soporte de SVG es **nativo y completo**.

### Como muestro un SVG? Necesito un WebView (`type="WEB"`)?

**No.** Un SVG es una imagen como cualquier otra: se renderiza de forma nativa. Refiérelo con `type="IMG"` (`path="dibujo.svg"`) o con los atributos `img`/`imgbk` de cualquier control, exactamente igual que un PNG. **Nunca** lo metas dentro de un `type="WEB"` ni lo conviertas a PNG: el control `WEB` es solo para contenido web remoto (URLs), y usarlo para una imagen local rompe el escalado y la integración con el control.
