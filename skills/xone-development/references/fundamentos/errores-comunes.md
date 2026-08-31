# XOne — Errores comunes de principiantes

> Fuente: `xone/v2/xone-help-docs/topics/01-xone-fundamentals.md` §10. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §10 errores comunes al empezar con XOne y su corrección

---

## 10. Errores Comunes de Principiantes

### Error 1: Usar unidades CSS web (`px`, `em`, `rem`)

```css
/* INCORRECTO - XOne no entiende px ni em */
.miBoton {
    width: 200px;
    height: 50px;
    font-size: 14px;
    margin-top: 10em;
}

/* CORRECTO - Usar p (puntos) o % (porcentaje) */
.miBoton {
    width: 200p;
    height: 50p;
    fontsize: 14;
    tmargin: 10p;
}
```

**Por que falla:** XOne usa `p` (pixel en el dispositivo de referencia definido por `resolution-width`/`resolution-height`) como unidad principal de dimensiones. El `fontsize` NO necesita unidad — usa la escala XOne 1-12 directamente. `p` no es Material `dp`: en 1080×1920, Material 56dp ≈ 168p.

---

### Error 2: Olvidar ##PREF## en consultas SQL

```xml
<!-- INCORRECTO - La tabla no se encontrara -->
<coll name="Tareas" sql="SELECT * FROM Tareas" ...>

<!-- INCORRECTO - Hardcodear el prefijo -->
<coll name="Tareas" sql="SELECT * FROM gen_tareas" ...>

<!-- CORRECTO - Usar la macro ##PREF## -->
<coll name="Tareas" sql="SELECT * FROM ##PREF##Tareas" ...>
```

**Por que falla:** Sin `##PREF##`, la consulta busca una tabla que no existe. Con el prefijo hardcodeado, deja de funcionar si cambia el prefijo del proyecto.

---

### Error 3: Poner colecciones extra en mappings.xne

```
INCORRECTO:
mappings.xne contiene: Empresas, Usuarios, Productos, Clientes, Pedidos

CORRECTO:
mappings.xne   -->  Solo Empresas y Usuarios
Productos.xne  -->  Coleccion Productos
Clientes.xne   -->  Coleccion Clientes
Pedidos.xne    -->  Coleccion Pedidos
```

**Por que falla:** Aunque tecnicamente puede funcionar, viola la convencion del framework y causa problemas de mantenimiento. Cada coleccion debe tener su propio archivo.

---

### Error 4: Usar APIs del DOM

```javascript
// INCORRECTO - APIs del DOM que NO existen en XOne
document.getElementById("campo").value = "test";
localStorage.setItem("key", "value");
window.alert("Hola");
console.log(document.querySelector(".clase"));

// CORRECTO - APIs de XOne
self.MAP_CAMPO = "test";
appData.setGlobalMacro("KEY", "value");
ui.msgBox("Hola", "Título", 0);
let control = ui.getView(self)["MAP_CAMPO"];

// ATENCION: `fetch` SI existe en XOne (implementación custom).
// El patrón idiomático sigue siendo $http, pero fetch es válido:
$http.get("https://api.com/datos", {}, successCb, errorCb);   // idiomático
fetch("https://api.com/datos").then(r => r.json());           // también válido
```

**Por que falla:** XOne no tiene DOM, ni `document`, ni `window`, ni `localStorage`. Tiene sus propias APIs. Lo que SÍ está disponible son las APIs WHATWG/Node enumeradas en §6.7 (`Promise`, `fetch`, `setTimeout`, `URL`, `Headers`, `AbortController`, `console.*` completo, `TextEncoder`/`TextDecoder`, `performance.now()`, `atob`/`btoa`, `structuredClone`, `DOMParser`/`XMLSerializer`, `globalThis`).

---

### Error 5: No crear la carpeta bd/

```
INCORRECTO:
MiProyecto/
|-- app.xml
|-- mappings.xne
+-- default.css
(sin carpeta bd/)

CORRECTO:
MiProyecto/
|-- app.xml
|-- mappings.xne
|-- default.css
|-- bd/
|   +-- gestion.db
+-- ...
```

**Por que falla:** La aplicación no puede funcionar sin la base de datos local. La carpeta `bd/` y el archivo `gestion.db` son imprescindibles.

---

### Error 6: Usar nombres CSS web para atributos

```css
/* INCORRECTO - Atributos CSS web */
.miClase {
    background-color: red;
    font-size: 14px;
    border-radius: 10px;
    margin-top: 20px;
    color: blue;
}

/* CORRECTO - Atributos CSS XOne */
.miClase {
    bgcolor: #FF0000;
    fontsize: 14;
    border-corner-radius: 10;
    tmargin: 20p;
    forecolor: #0000FF;
}
```

**Por que falla:** XOne tiene sus propios nombres de atributos CSS. `background-color` no existe, se usa `bgcolor`. `border-radius` no existe, se usa `border-corner-radius`.

---

### Error 7: Olvidar objname en colecciones que necesitan tabla

```xml
<!-- INCORRECTO - Esta coleccion NO creara tabla en BD -->
<coll name="Tareas" sql="SELECT * FROM ##PREF##Tareas">
    <!-- Falta objname, así que no se persiste -->
</coll>

<!-- CORRECTO - Con objname, se creara la tabla gen_tareas -->
<coll name="Tareas"
      sql="SELECT * FROM ##PREF##Tareas"
      objname="Tareas"
      updateobj="Tareas">
    <!-- objname indica que esta coleccion necesita tabla en BD -->
</coll>
```

**Por que falla:** Sin el atributo `objname`, XOne trata la coleccion como especial (solo memoria). No se genera tabla y los datos no se guardan.

---

### Error 8: Usar formatos de imagen no soportados en icons/

XOne soporta **PNG, JPG y SVG** en la carpeta `icons/`. Los tres formatos funcionan correctamente como iconos y recursos gráficos.

```
CORRECTO — cualquiera de estos formatos funciona:
icons/
|-- ic_menu.png
|-- ic_menu.svg
+-- ic_menu.jpg
```

El formato más habitual es PNG por compatibilidad historica, pero SVG es perfectamente valido y tiene la ventaja de escalar sin perder calidad.

**Anti-patrón frecuente — NO renderizar SVG con un `type="WEB"`:** el soporte de SVG en XOne es nativo y completo. Un `.svg` es una imagen más: se refiere con `type="IMG"` (`path="dibujo.svg"`) o con los atributos `img`/`imgbk`, igual que un PNG. Envolverlo en un WebView (`type="WEB"`) para "que se vea" es innecesario, no aporta nada y rompe el escalado y la integración con el control. El control `WEB` es solo para contenido web remoto (URLs), nunca para imágenes locales.

---

### Error 9: Pensar que hay que declarar `ID` o `ROWID`

`ID` (clave autonumérica) y `ROWID` (GUID de 32 hex de sincronización) son **columnas de plataforma**: XOne las crea y las rellena por su cuenta (el `ROWID` se autogenera en cada alta). **No hace falta declararlas** como `<prop>` — basta con los campos de negocio:

```xml
<!-- Suficiente: ID y ROWID los gestiona XOne -->
<coll name="Empresas" ...>
    <group name="General" id="1">
        <prop name="CODIGO" type="N" visible="7" />
        <prop name="NOMBRE" type="T" visible="7" fieldsize="150" />
    </group>
</coll>
```

Declararlas explícitamente (`<prop name="ID">` / `<prop name="ROWID">`) **no causa ningún problema** — el framework sigue gestionando sus valores —, pero es **redundante**; la recomendación es omitirlas por limpieza. En el `sql=` de la coll, el `ID` sí se rescata en el SELECT; el `ROWID` no es necesario.

---

### Error 10: Mezclar sintaxis de otros frameworks

```xml
<!-- INCORRECTO - Esto NO es React ni Angular -->
<div class="container">
    <input type="text" ng-model="nombre" />
    <button onClick={() => guardar()}>Guardar</button>
</div>

<!-- CORRECTO - Sintaxis XOne -->
<frame name="frmContenedor" width="100%" height="100%">
    <prop name="MAP_NOMBRE" type="T" visible="7"
          width="80%" height="40p" />
    <prop name="MAP_BTN_GUARDAR" type="B" visible="7"
          width="80%" height="50p" title="Guardar"
          onclick="guardar();" />
</frame>
```

**Por que falla:** XOne es un framework completamente independiente. No usa HTML, no tiene `<div>`, `<input>` ni `<button>`. Los componentes son `<coll>`, `<frame>`, `<prop>` y `<group>`.

---

### Error 11: Repetir nombres de nodos dentro de la misma coleccion

> **El ambito de unicidad es la `<coll>` ENTERA**, no el `<group>` o `<frame>` inmediato. Dos `<prop>` con el mismo `name` fallan **aunque estén en `<group>` o `<frame>` distintos** dentro de la misma coll. Lo mismo aplica a `<group>`, `<frame>` y a los nodos de evento.

```xml
<\!-- INCORRECTO - dos group con el mismo name -->
<coll name="MiPantalla" special="true">
    <group name="grpPrincipal" id="1">
        <frame name="frmHeader" width="100%" height="100p"/>
    </group>
    <group name="grpPrincipal" id="2">  <\!-- ERROR: nombre duplicado -->
        <frame name="frmBody" width="100%" height="-2"/>
    </group>
</coll>

<\!-- INCORRECTO - dos prop con el mismo name dentro del mismo group -->
<group name="grpDatos" id="1">
    <prop name="NOMBRE" type="T" visible="7"/>
    <prop name="NOMBRE" type="L" visible="2"/>  <\!-- ERROR: nombre duplicado -->
</group>

<\!-- INCORRECTO - dos prop con el mismo name en GROUPS DISTINTOS de la misma coll -->
<coll name="MiPantalla" special="true">
    <group name="grpUno" id="1">
        <frame name="frm1" width="100%" height="50%">
            <prop name="MAP_DATO" type="T" visible="1"/>
        </frame>
    </group>
    <group name="grpDos" id="2">
        <frame name="frm2" width="100%" height="50%">
            <prop name="MAP_DATO" type="L" visible="2"/>  <\!-- ERROR: el name "MAP_DATO" ya existe en grpUno -->
        </frame>
    </group>
</coll>

<\!-- INCORRECTO - dos prop con el mismo name en FRAMES DISTINTOS dentro del mismo group -->
<group name="grpUnico" id="1">
    <frame name="frmA">
        <prop name="MAP_X" type="T" visible="1"/>
    </frame>
    <frame name="frmB">
        <prop name="MAP_X" type="L" visible="2"/>  <\!-- ERROR: el name "MAP_X" ya existe en frmA -->
    </frame>
</group>

<\!-- CORRECTO - nombres unicos en TODA la coll (no solo dentro de cada group/frame) -->
<coll name="MiPantalla" special="true">
    <group name="grpHeader" id="1">
        <frame name="frmHeader" width="100%" height="100p"/>
    </group>
    <group name="grpBody" id="2">
        <frame name="frmBody" width="100%" height="-2"/>
        <prop name="MAP_NOMBRE_EDIT" type="T" visible="1"/>
        <prop name="MAP_NOMBRE_LISTA" type="L" visible="2"/>
    </group>
</coll>
```

**Por que falla:** El `name` de cada nodo (`<prop>`, `<group>`, `<frame>`, eventos) se publica a nivel de la propia `<coll>` (los `collprops`), no del `<group>` o `<frame>` que lo contiene. Por eso, si se repitiera el `name` en cualquier sitio dentro de la misma coll, actuaria como identificador único ambiguo. La unicidad se evalua sobre la coll completa.

**Lo que SI es valido:** dos `<coll>` distintas con contenido **identico** (incluso los mismos `name` de prop/group/frame internos) siempre que el atributo `name` **de la propia coll** sea distinto. Cada coll es un ambito independiente.

**Lo que NO es valido:** dos `<coll>` con el mismo `name` en el proyecto.

---

Esta guía ha cubierto los conceptos fundamentales de XOne:

| Concepto | Resumen |
|----------|---------|
| **Plataforma** | Framework para apps móviles nativas (Android + iOS) desde código único |
| **Arquitectura** | XML declarativo (UI) + JavaScript imperativo (lógica) + SQLite (datos) |
| **Archivos principales** | `app.xml`, `app.ini`, `mappings.xne`, `default.css`, `functions.js` |
| **Colecciones** | Concepto central que une tabla + pantalla + formulario |
| **Propiedades** | Elemento dual: campo de datos + control visual |
| **Navegación** | `ui.openEditView()`, `window.exit()` |
| **Prefijo** | `##PREF##` en SQL para referencia dinámica a tablas |
| **Regla de oro** | `mappings.xne` solo contiene Empresas y Usuarios |

### Proximos Pasos

- **02 - Estructura XML y Colecciones**: Profundiza en la sintaxis XML, nodos, atributos y patrones de colecciones
- **04 - Estilos CSS en XOne**: Referencia completa de atributos CSS propietarios
- **03 - API JavaScript**: Documentación detallada de `ui.*`, `self.*`, `appData.*` y más
- **05 - Eventos, Patrones y FAQ**: Tutorial paso a paso para crear proyectos completos

---

*Este documento forma parte del sistema de ayuda XOne. Basado en el análisis de 224 proyectos de ejemplo reales, 5 proyectos sinteticos documentados y la documentación oficial de la plataforma.*
