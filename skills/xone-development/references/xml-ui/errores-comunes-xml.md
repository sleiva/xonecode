# XOne XML — Errores comunes a evitar

> Fuente: `xone/v2/xone-project-generator/references/xone-xml-ui-e-mapas-errores.md` §14. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §14 errores comunes de XML y su corrección

---

## 14. Errores Comunes a Evitar

### Error 1: Usar CSS Web Estándar

```css
/* INCORRECTO */
prop { font-size: 14px; margin-top: 10px; }

/* CORRECTO */
prop { fontsize: 14; tmargin: 10p; }
```

### Error 2: Olvidar ##PREF## en SQL

```xml
<!-- INCORRECTO -->
<coll sql="SELECT * FROM Productos">

<!-- CORRECTO -->
<coll sql="SELECT * FROM ##PREF##Productos">
```

### Error 3: Tipos No Validos

```xml
<!-- INCORRECTO -->
<prop name="NOMBRE" type="STRING" />

<!-- CORRECTO -->
<prop name="NOMBRE" type="T" />
```

### Error 4: Sin objname para Persistencia

```xml
<!-- NO SE PERSISTE -->
<coll name="Productos">

<!-- SE PERSISTE -->
<coll name="Productos" objname="Productos">
```

### Error 5: APIs Web en JavaScript

```javascript
// INCORRECTO
document.getElementById("campo").value = "test";
localStorage.setItem("key", "value");

// CORRECTO
self.MAP_CAMPO = "test";
appData.setGlobalMacro("KEY", "value");
```

### Error 6: Todas las Colecciones en mappings.xne

mappings.xne solo debe contener Empresas y Usuarios. Las demas colecciones van en archivos `.xne` separados.

### Error 7: Campos Obligatorios Faltantes

Empresas necesita: `CODIGO`, `NOMBRE`, `ROWID`
Usuarios necesita: `CODIGO`, `NOMBRE`, `IDEMPRESA`, `LOGIN`, `PWD`, `ROWID`

### Error 8: Prefijo Diferente a "gen" Sin Autorización

Siempre usar `prefix="gen"` a menos que el usuario lo solicite explicitamente.

### Error 9: Falta @ en name del Contents

```xml
<!-- INCORRECTO -->
<contents name="MiContenido" src="MiColeccion" />

<!-- CORRECTO -->
<contents name="@MiContenido" src="MiColeccion" />
```

El `@` va siempre en el `name` del nodo `<contents>` y en el atributo `contents` del `<prop type="Z">` que lo referencia.

### Error 10: Sintaxis de Otros Frameworks

No usar HTML (`<div>`, `<input>`), ni sintaxis React/Angular/Vue. Usar siempre nodos XOne (`<frame>`, `<prop>`, `<coll>`).

### Error 11: progid incorrecto en Empresas / Usuarios

`progid` es **opcional**: si se omite, la coll se comporta como un objeto de datos genérico (equivalente a `ASData.CASBasicDataObj`). El error real es **olvidar el progid propio en las colecciones especiales** Empresas y Usuarios, que lo necesitan para activar su lógica de negocio:

```xml
<!-- INCORRECTO: Empresas/Usuarios sin su progid propio -->
<coll name="Empresas" objname="empresa" ...>
<coll name="Usuarios" objname="usuarios" ...>

<!-- CORRECTO -->
<coll name="Empresas" objname="empresa" progid="ASGestion.CASEmpresa" ...>
<coll name="Usuarios" objname="usuarios" progid="ASGestion.CASUser" ...>
```

Valores:
- (omitido) o `ASData.CASBasicDataObj` — cualquier coleccion de negocio genérica
- `ASGestion.CASEmpresa` — coleccion Empresas, en mappings.xne
- `ASGestion.CASUser` — coleccion Usuarios, en mappings.xne

### Error 12: Encoding incoherente en ficheros XNE

El motor respeta el `encoding` declarado en el prólogo del `.xne` (y asume UTF-8 si no se declara). UTF-8 e `iso-8859-15` son **ambos válidos**. El error real es la **discrepancia**: declarar un encoding distinto de cómo está realmente guardado el fichero, lo que corrompe tildes y ñ.

```xml
<!-- INCORRECTO: declara iso-8859-15 pero el fichero está guardado como UTF-8 (o al revés) -->
<?xml version="1.0" encoding="iso-8859-15"?>   <!-- ...y los bytes son UTF-8: tildes/ñ corruptas -->

<!-- CORRECTO: el encoding declarado coincide con cómo se guarda el fichero -->
<?xml version="1.0" encoding="utf-8"?>          <!-- fichero realmente guardado en UTF-8 -->
```

### Error 13: Estructura Incorrecta de mappings.xne

```xml
<!-- INCORRECTO: collprops no existe en XOne -->
<xml>
    <collprops type="general">
        <coll name="Empresas" ...>

<!-- CORRECTO: las colecciones van directamente dentro de <xml> -->
<xml>
    <app .../>
    <coll name="Empresas" progid="ASGestion.CASEmpresa" ...>
    <coll name="Usuarios" progid="ASGestion.CASUser" ...>
</xml>
```

### Error 14: filter y sort dentro del SQL

```xml
<!-- INCORRECTO: el filtro dentro del SQL no es gestionado por el framework -->
<coll sql="SELECT * FROM ##PREF##Productos WHERE ACTIVO=1 ORDER BY NOMBRE">

<!-- CORRECTO: filter y sort como atributos separados del nodo coll -->
<coll sql="SELECT t1.* FROM ##PREF##Productos t1"
      filter="ACTIVO=1"
      sort="NOMBRE ASC">
```

### Error 15: Evento del Calendario con Guion

```xml
<!-- INCORRECTO -->
<ondate-selected>
    <script>self.FECHA = e.selectedDate;</script>
</ondate-selected>

<!-- CORRECTO: sin guion, y el parametro es DATEVALUE (no e.selectedDate) -->
<ondateselected>
    <action name="runscript">
        <param name="DATEVALUE" />
        <script language="javascript">
            self.MAP_FECHA_SEL = DATEVALUE;
        </script>
    </action>
</ondateselected>
```

### Error 16: Usar APIs del DOM en JavaScript

XOne no es HTML y no ejecuta código en un navegador. Estas APIs del DOM **no existen** en el entorno XOne y causarán errores:

```javascript
// INCORRECTO — APIs del DOM, no existen en XOne
document.getElementById("campo").value = "hola";
document.querySelector(".clase").style.display = "none";
window.location.href = "otraPantalla";
localStorage.setItem("clave", "valor");
sessionStorage.getItem("clave");
navigator.geolocation.getCurrentPosition(cb);
history.back();

// CORRECTO — usar las APIs propias de XOne (idiomáticas)
self.MAP_CAMPO = "hola";                          // escribir en campo
ui.openEditView("OtraPantalla");                  // navegar (forma corta: XOne crea el dataObject internamente)
appData.setGlobalMacro("CLAVE", "valor");         // almacenar globalmente
appData.getGlobalMacro("CLAVE");                  // recuperar valor global
$http.get("https://api.ejemplo.com/datos", ...);  // petición HTTP idiomática
ui.startGps(...);                                 // GPS

// TAMBIÉN funcionan — implementación custom XOne, semántica spec-compatible
fetch("https://api.ejemplo.com/datos").then(r => r.json());  // alternativa a $http
new Promise((resolve, reject) => { resolve(42); });           // Promise ES2024
setTimeout(() => doIt(), 1000);                               // ms (no segundos)
```

### Error 17: Nombres de nodos duplicados dentro de una coleccion

**Esta es una restricción crítica de la plataforma XOne.** Dentro de una `<coll>`, cada nodo con atributo `name` debe tener un nombre único en su ambito. Tampoco puede haber dos `<coll>` con el mismo nombre en el proyecto.

```xml
<!-- INCORRECTO: dos <group> con el mismo name -->
<coll name="MiPantalla" special="true">
    <group name="grpPrincipal" id="1">...</group>
    <group name="grpPrincipal" id="2">...</group>  <!-- ERROR -->
</coll>

<!-- INCORRECTO: dos <prop> con el mismo name -->
<group name="grpDatos" id="1">
    <prop name="NOMBRE" type="T" visible="7"/>
    <prop name="NOMBRE" type="L" visible="2"/>    <!-- ERROR -->
</group>

<!-- INCORRECTO: dos <frame> con el mismo name -->
<group name="grpPrincipal" id="1">
    <frame name="frmBody" width="100%" height="200p"/>
    <frame name="frmBody" width="100%" height="-2"/> <!-- ERROR -->
</group>

<!-- INCORRECTO: dos eventos del mismo tipo -->
<coll name="MiPantalla" special="true">
    <before-edit>...</before-edit>
    <before-edit>...</before-edit>                 <!-- ERROR -->
</coll>

<!-- CORRECTO: todos los nombres son unicos en su ambito -->
<coll name="MiPantalla" special="true">
    <before-edit>...</before-edit>
    <group name="grpPrincipal" id="1">
        <frame name="frmHeader" width="100%" height="100p"/>
        <frame name="frmBody"   width="100%" height="-2"/>
        <prop name="MAP_TITULO"    type="L" visible="7"/>
        <prop name="MAP_SUBTITULO" type="L" visible="7"/>
    </group>
    <group name="grpSecundario" id="2">...</group>
</coll>
```

**Lo que SI es valido:** dos `<coll>` con distinto `name` pero contenido identico. La restricción es sobre el nombre, no sobre el contenido.

---

*Documento de referencia generado a partir de las knowledgebases del proyecto XOneAI, la base de conocimiento estructurada (docs/kb/) y el análisis de 572 archivos .xne de 224 proyectos reales.*

