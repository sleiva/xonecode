# XOne — Plataforma y anatomía de un proyecto

> Fuente: `xone/v2/xone-help-docs/topics/01-xone-fundamentals.md` §1–§3, §5. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §1 qué es XOne · §2 arquitectura: modelo declarativo + imperativo, ciclo de vida colección/objeto/propiedad, flujo de datos, sincronización con servidor · §3 anatomía del proyecto: archivos y carpetas obligatorias y opcionales, diagrama de estructura · §5 tipos de archivo

---

## 1. Que es XOne?

XOne es una **plataforma de desarrollo de aplicaciones móviles** que permite generar apps nativas para Android e iOS a partir de un único código fuente. A diferencia de otros frameworks multiplataforma, XOne utiliza un enfoque **declarativo basado en XML** para definir la interfaz de usuario, combinado con **JavaScript** para la lógica de negocio.

### Componentes del Ecosistema

El ecosistema XOne se compone de tres elementos principales:

| Componente | Descripción |
|------------|-------------|
| **Framework XOne** | Motor que interpreta los archivos XML, CSS y JS para generar las interfaces nativas en cada plataforma |
| **Runtime XOne** | Entorno de ejecución que corre en el dispositivo móvil, renderizando la UI y ejecutando la lógica |
| **Servidor de Replica** | Componente de backend que permite la sincronización bidireccional de datos entre dispositivos y servidor central |

### Que hace diferente a XOne?

Si vienes del desarrollo web, estas analogias te ayudaran a entender la filosofia de XOne:

| Concepto Web | Equivalente XOne | Diferencia Clave |
|-------------|-----------------|------------------|
| HTML | Archivos `.xne` (XML) | XOne usa nodos como `<coll>`, `<prop>`, `<frame>` en vez de `<div>`, `<input>`, `<span>` |
| CSS | `default.css` | Sintaxis similar pero con atributos propietarios; unidades `p` y `%` en vez de `px` y `em` |
| JavaScript | `functions.js` | API propia (`ui.*`, `self.*`, `appData.*`) en vez de APIs del navegador (`document.*`, `window.*`) |
| Base de datos | `bd/gestion.db` (SQLite) | Base de datos local integrada que se sincroniza automáticamente con el servidor |

> **Nota importante:** Aunque la sintaxis pueda parecer familiar, XOne NO es desarrollo web. No tiene DOM, no tiene navegador, no tiene `document` ni `window`. Las APIs son completamente propias de la plataforma.

### Ventajas Principales

1. **Código único, apps nativas**: Un solo proyecto genera apps para Android e iOS con rendimiento nativo
2. **Funcionamiento offline**: La base de datos SQLite local permite trabajar sin conexión
3. **Sincronización automática**: El sistema de replica sincroniza datos cuando hay conectividad
4. **Desarrollo rápido**: El modelo declarativo reduce drasticamente el código necesario
5. **Sin compilación**: Los cambios en XML/CSS/JS se reflejan sin necesidad de recompilar

---

## 2. Arquitectura de XOne

### 2.1 Modelo Declarativo + Imperativo

XOne combina dos paradigmas de programación:

**Declarativo (XML):** Define QUE mostrar en la pantalla. Se usa para:
- Estructura de la interfaz de usuario
- Definición de campos y tipos de datos
- Layout y posicionamiento de elementos
- Configuración de eventos

**Imperativo (JavaScript):** Define COMO comportarse. Se usa para:
- Lógica de negocio
- Validaciones complejas
- Navegación programatica
- Integraciones con APIs externas
- Manipulación de datos

```
 +-----------------------+     +------------------------+
 |    XML Declarativo    |     |  JavaScript Imperativo |
 |  (.xne / .xml / .css)|     |       (.js)            |
 +-----------+-----------+     +-----------+------------+
             |                             |
             v                             v
       +-----+-----------------------------+------+
       |        Runtime XOne (Dispositivo)        |
       |  - Renderiza UI nativa                   |
       |  - Ejecuta logica JS                     |
       |  - Gestiona BD local                     |
       |  - Sincroniza con servidor               |
       +------------------------------------------+
                         |
               +---------+---------+
               |                   |
         +-----+------+    +------+------+
         |  Android   |    |    iOS      |
         |  (Nativo)  |    |  (Nativo)   |
         +------------+    +-------------+
```

### 2.2 Ciclo de Vida: Coleccion, Objeto, Propiedad

El modelo de datos de XOne se organiza en tres niveles jerarquicos. Si vienes de bases de datos, la analogia es directa:

| Nivel XOne | Equivalente BD | Equivalente Web | Descripción |
|------------|---------------|-----------------|-------------|
| **Coleccion** (`coll`) | Tabla | Página/Componente | Define estructura de datos + UI |
| **Objeto** (DataObject) | Fila/Registro | Instancia | Una unidad de datos concreta |
| **Propiedad** (`prop`) | Columna/Campo | Input/Label | Un dato individual + su representación visual |

Cada coleccion tiene su propio ciclo de vida con eventos bien definidos:

```
  Coleccion creada
       |
       v
   [create]  -->  Se ejecuta una sola vez al crear la instancia
       |
       v
    [load]   -->  Se ejecuta cada vez que la pantalla se muestra
       |
       v
  [onchange] -->  Se ejecuta cuando cambia el valor de un campo
       |
       v
  [onback]   -->  Se ejecuta cuando el usuario pulsa el boton "atras"
```

**Ejemplo práctico del ciclo de vida:**

```xml
<coll name="DetalleTarea" title="Detalle de Tarea">
    <!-- Se ejecuta UNA vez al crear la coleccion -->
    <create>
        <action name="runscript">
            <script language="javascript">
                // Inicializar valores por defecto
                self.MAP_FECHA = new Date();
                self.MAP_ESTADO = "PENDIENTE";
            </script>
        </action>
    </create>

    <!-- Se ejecuta CADA VEZ que la pantalla se muestra -->
    <load>
        <action name="runscript">
            <script language="javascript">
                // Actualizar contadores o datos dinamicos
                actualizarContador();
            </script>
        </action>
    </load>

    <!-- Se ejecuta cuando CAMBIA el valor de un campo -->
    <onchange>
        <field name="MAP_ESTADO">
            <action name="runscript">
                <script language="javascript">
                    // Reaccionar al cambio de estado
                    if (self.MAP_ESTADO == "COMPLETADA") {
                        self.MAP_FECHA_FIN = new Date();
                    }
                </script>
            </action>
        </field>
    </onchange>

    <!-- Contenido de la pantalla aquí -->

    <!-- Se ejecuta al pulsar ATRAS -->
    <onback>
        <action name="runscript">
            <script language="javascript">
                let window = ui.getView(self);
                if (window) {
                    window.exit();
                }
            </script>
        </action>
    </onback>
</coll>
```

### 2.3 Flujo de Datos

El flujo de datos en XOne sigue un patron claro entre la base de datos local, las colecciones en memoria y la interfaz de usuario:

```
  +----------------+          +-------------------+          +----------+
  | BD Local       |  <---->  | Coleccion         |  <---->  | UI       |
  | (gestion.db)   |  SQL     | (objetos en       |  binding | (props,  |
  | SQLite         |          |  memoria)         |          |  frames) |
  +----------------+          +-------------------+          +----------+
         ^
         |  Sincronización
         v
  +----------------+
  | Servidor       |
  | de Replica     |
  +----------------+
```

1. **BD Local -> Coleccion**: Las colecciones cargan datos de SQLite mediante el atributo `sql`
2. **Coleccion -> UI**: Las propiedades (`prop`) muestran los datos de la coleccion automáticamente
3. **UI -> Coleccion**: Cuando el usuario edita un campo, el valor se actualiza en el objeto (DataObject)
4. **Coleccion -> BD Local**: Al llamar a `save()`, los cambios se persisten en SQLite
5. **BD Local <-> Servidor**: El sistema de replica sincroniza los datos bidireccionalmente

### 2.4 Sincronización con Servidor

La sincronización es una de las caracteristicas más poderosas de XOne. Cada registro en la base de datos tiene un campo `ROWID` que contiene un GUID (identificador único global) de 32 caracteres hexadecimales. Este GUID permite:

- Identificar de forma única cada registro en cualquier dispositivo
- Resolver conflictos de sincronización
- Mantener la integridad referencial entre dispositivos

```
  Dispositivo A          Servidor            Dispositivo B
  +----------+          +--------+          +----------+
  | ROWID:   |  push    |        |  pull    | ROWID:   |
  | a1b2c3.. | -------> | a1b2.. | -------> | a1b2c3.. |
  +----------+          +--------+          +----------+
```

> **Nota:** El `ROWID` es una **columna de plataforma**: el framework la crea y la rellena sola (autogenera el GUID de 32 caracteres hex en cada alta) y el motor de réplica la usa como clave global de fila. **No hace falta declararla** como `<prop>` (igual que el `ID`); declararla es válido pero redundante, así que mejor omitirla por limpieza.

---

## 3. Anatomia de un Proyecto XOne

### 3.1 Archivos Obligatorios

Todo proyecto XOne requiere estos archivos en la raiz:

| Archivo | Proposito | Equivalente Web |
|---------|-----------|-----------------|
| `app.xml` | Configuración global de la aplicación | `package.json` + configuración del framework |
| `app.ini` | Metadatos de la aplicación (nombre, icono) | `manifest.json` |
| `mappings.xne` | Colecciones base (Empresas y Usuarios) | Schema de base de datos |
| `default.css` | Estilos globales de la aplicación | Archivo CSS global |
| `functions.js` | Funciones JavaScript compartidas | Archivo JS de utilidades |
| `EntradaApp.xne` | Pantalla de entrada de la aplicación | `index.html` |

Además, cada coleccion adicional y cada pantalla se define en su propio archivo `.xne`:

```
MenuPrincipal.xne     -->  Pantalla del menu principal
ListaTareas.xne       -->  Pantalla con lista de tareas
DetalleTarea.xne      -->  Pantalla de detalle/edicion
Tareas.xne            -->  Definición de coleccion (tabla + campos)
Categorias.xne        -->  Otra coleccion
```

### 3.2 Carpetas Obligatorias

| Carpeta | Contenido | Por que es obligatoria |
|---------|-----------|----------------------|
| `bd/` | `gestion.db` (base de datos SQLite) | Sin BD la app no puede almacenar ni consultar datos |
| `icons/` | Iconos y recursos gráficos (PNG, JPG, SVG) | La app necesita iconos para botones, menú, etc. (el splash NO va aquí — ver §4.1) |
| `files/` | Archivos dinámicos (fotos, firmas, documentos) | Directorio de trabajo para archivos generados en runtime |

### 3.3 Carpetas Opcionales

| Carpeta | Contenido | Cuando usarla |
|---------|-----------|---------------|
| `fonts/` | Fuentes tipograficas (.ttf, .otf) | Cuando necesitas tipografía personalizada |
| `lang/` | Subcarpetas por idioma (`en/`, `es/`, `fr/`) | Para apps multiidioma |
| `native/` | Código nativo (`Android/`, `IOS/`) | Para integraciones nativas avanzadas |
| `scripts/` | Scripts JS organizados en subcarpetas | En proyectos grandes con mucho JS |
| `certificates/` | Certificados SSL/TLS (.crt, .pem) | Para conexiones seguras personalizadas |

### 3.4 Diagrama de Estructura Completa

A continuacion, el diagrama de un proyecto XOne típico. Los elementos marcados con `[OBL]` son obligatorios:

```
MiProyectoXOne/
|
|-- app.xml                    [OBL] Configuración de la aplicacion
|-- app.ini                    [OBL] Metadatos (nombre, icono)
|-- mappings.xne               [OBL] SOLO Empresas y Usuarios
|-- default.css                [OBL] Estilos globales
|-- functions.js               [OBL] Funciones JS globales
|-- EntradaApp.xne             [OBL] Pantalla de entrada
|-- splash.png                 [OPC] Imagen de splash (ver §4.1 "Pantalla de splash")
|
|-- MenuPrincipal.xne          Pantalla del menu
|-- Login.xne                  Pantalla de login
|-- ListaClientes.xne          Pantalla de listado
|-- DetalleCliente.xne         Pantalla de detalle
|-- Clientes.xne               Colección (datos de clientes)
|-- Productos.xne              Colección (datos de productos)
|
|-- bd/                        [OBL] Base de datos
|   +-- gestion.db             Archivo SQLite
|
|-- icons/                     [OBL] Recursos gráficos
|   |-- app_icon.png           Icono de la app (192x192)
|   |-- ic_menu.png            Icono de menú (48x48)
|   |-- ic_search.png          Icono de búsqueda (48x48)
|   +-- ic_arrow_back.png      Flecha atrás (48x48)
|
|-- files/                     [OBL] Archivos dinamicos
|   |-- fotos/
|   |-- documentos/
|   +-- firmas/
|
|-- fonts/                     [REC] Fuentes tipograficas
|   |-- Roboto-Regular.ttf
|   +-- Roboto-Bold.ttf
|
|-- scripts/                   [OPC] Scripts organizados
|   |-- login/
|   +-- general/
|
+-- lang/                      [OPC] Multiidioma
    |-- en/
    +-- es/
```

> **Regla crítica:** El archivo `mappings.xne` SOLO debe contener las colecciones `Empresas` y `Usuarios`. Todas las demas colecciones van en archivos `.xne` separados, uno por cada coleccion. Ver sección [4.3 mappings.xne](#43-mappingsxne) para más detalle.

## 5. Tipos de Archivos en XOne

XOne utiliza varios tipos de archivos, cada uno con un proposito especifico:

| Extensión | Tipo | Proposito | Equivalente Web |
|-----------|------|-----------|-----------------|
| `.xne` | XML propietario | Definición de colecciones y pantallas | `.html` + `.json` (schema) |
| `.css` | CSS propietario | Estilos visuales (NO es CSS web estándar) | `.css` (con diferencias importantes) |
| `.js` | JavaScript | Lógica de negocio y funciones | `.js` (API diferente) |
| `.xml` | XML estándar | Configuración (`app.xml`) | Archivos de configuración |
| `.ini` | Texto plano | Metadatos (`app.ini`) | `.env` / `manifest.json` |
| `.db` | SQLite | Base de datos local | Base de datos del backend |

### Archivos .xne (fuente) vs .xml (generado por XOneStudio)

En XOne hay una distincion fundamental entre **fuente** y **salida generada**:

| Extensión | Rol | Quien lo edita |
|-----------|-----|----------------|
| `.xne` | **Fichero fuente** de colecciones y pantallas | El programador (y la IA) — es lo único que se edita |
| `.xml` (de colecciones/pantallas) | **Artefacto generado automáticamente** por XOneStudio a partir del `.xne` correspondiente | **Nadie** — se regenera solo |
| `app.xml` | Configuración global de la aplicación (única excepción) | El programador — es fuente, no tiene `.xne` que lo genere |

Los archivos `.xne` son el corazón de XOne. Aunque tienen contenido XML, usan la extensión `.xne` (XOne Native Extensión). Un mismo archivo `.xne` puede definir:

- **Una coleccion de datos** (como una tabla de BD con sus campos)
- **Una pantalla** (con su layout, botones y lógica)
- **Ambas cosas a la vez** (coleccion + presentación visual)

#### Por que existen los `.xml` de colecciones

XOneStudio genera automáticamente un `.xml` por cada `.xne` porque **algunos motores de ejecución del framework todavia leen `.xml`**. No son ficheros legacy ni restos de proyectos antiguos: se generan hoy, en proyectos nuevos, como artefacto de build. El plan de futuro es que desaparezcan y todo quede solo en `.xne`.

#### Regla operativa: solo `.xne`

> **Al trabajar sobre un proyecto XOne (nuevo o existente), solo se tocan los ficheros `.xne`. Los `.xml` de colecciones o pantallas que aparezcan se ignoran por completo: no se leen, no se editan, no se consultan, no se crean. La única excepción es `app.xml` (configuración global), que SI es fuente.**

Esto aplica tanto si el proyecto tiene solo `.xne` como si tiene `.xne` y `.xml` conviviendo. La coexistencia es normal hoy en día; el trabajo con IA se comporta como si los `.xml` (excepto `app.xml`) no existieran.

### Archivos .css (Estilos Propietarios)

El CSS de XOne se parece al CSS web pero tiene diferencias cruciales:

| Caracteristica | CSS Web | CSS XOne |
|---------------|---------|----------|
| Unidades de medida | `px`, `em`, `rem`, `vw` | `p` (puntos), `%` (porcentaje) |
| Selectores | `#id`, `.clase`, `tag`, `[attr]` | `coll`, `prop`, `prop:TYPE`, `.clase` |
| Herencia | `inherit`, cascada natural | `extends:.otraClase` |
| Colores | `#RGB`, `rgb()`, `hsl()`, nombres | `#RRGGBB`, `#AARRGGBB` |
| Modelo de caja | `box-sizing`, `margin`, `padding` | `tmargin`, `bmargin`, `lmargin`, `rmargin` |

> Para la referencia completa de atributos CSS, consulta el tópico 04 - Estilos CSS en XOne.

### Archivos .js (JavaScript)

El JavaScript de XOne usa un motor propio con APIs específicas:

```javascript
// Esto NO funciona en XOne (APIs del DOM):
document.getElementById("miCampo");     // NO existe
window.addEventListener("click", fn);   // NO existe
localStorage.setItem("key", "val");     // NO existe

// Esto SÍ funciona en XOne (APIs propias):
self.MAP_CAMPO;                         // Acceder a un campo
ui.showToast("Mensaje");                // Mostrar notificación
appData.getCollection("Tareas");        // Obtener coleccion
$http.get(url, request, ok, err);       // Petición HTTP (forma idiomática)

// Esto también funciona (implementación custom XOne, compatible con spec):
fetch("https://api.com/datos").then(r => r.json());       // sí existe
new Promise((resolve, reject) => { resolve(42); });        // sí existe (ES2024)
setTimeout(() => console.log("hola"), 1000);               // sí existe
class Tarea { constructor(t) { this.titulo = t; } }       // sí existe
```

> Para la referencia completa de la API JavaScript, consulta el tópico 03 - API JavaScript.

