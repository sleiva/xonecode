# XOne — Archivos de configuración: app.xml, app.ini y mappings.xne

> Fuente: `xone/v2/xone-help-docs/topics/01-xone-fundamentals.md` §4. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §4 configuración completa: atributos de app.xml (incluido compatibility-mode), app.ini y mappings.xne

---

## 4. Archivos de Configuración

### 4.1 app.xml

El archivo `app.xml` es el **punto de partida** de toda la configuración. Define como se comporta la aplicación, donde están sus recursos y cual es la pantalla inicial.

#### Estructura Completa

```xml
<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<xml>
    <app
        prefix="gen"
        version="1.0.0"
        debug="true"
        autologon="false"
        screen-orientation="portrait"
        resolution-width="1080"
        resolution-height="1920"
        scale-fontsize="true"
        android-font-factor="7"
        ios-font-factor="8"
        default-language="javascript">

        <!-- Conexión a una base de datos alternativa. La base de datos principal NO necesita este nodo. -->
        <connection name="other_db" connstring="bd/other_db.db" />

        <!-- Primera pantalla que se abre al iniciar la app -->
        <entry-point>
            <item name="EntradaApp" conditions="" />
        </entry-point>

        <!-- Pantalla de login (opcional pero recomendada) -->
        <login-coll>
            <item name="Login" conditions="" />
        </login-coll>

        <!-- Archivos CSS -->
        <style url="default.css" encoding="UTF-8" />

        <!-- Archivos JavaScript -->
        <include file="functions.js" language="javascript" encoding="UTF-8"/>
    </app>
</xml>
```

#### Atributos Explicados Linea por Linea

| Atributo | Valor | Explicacion |
|----------|-------|-------------|
| `prefix` | `"gen"` | Prefijo para las tablas en la BD. Las tablas se llamaran `gen_empresas`, `gen_usuarios`, etc. **Siempre usar "gen" por defecto** a menos que el usuario pida otro |
| `versión` | `"1.0.0"` | Versión semantica de la aplicación |
| `debug` | `"true"` / `"false"` | Activa mensajes de depuracion. Usar `"true"` en desarrollo, `"false"` en produccion |
| `autologon` | `"false"` | Si es `"true"`, salta la pantalla de login y entra directamente con el usuario `admin` sin password. **Solo para desarrollo/pruebas** |
| `screen-orientation` | `"portrait"` | Orientación forzada: `"portrait"` (vertical), `"landscape"` (horizontal), `"all"` (ambas) |
| `resolution-width` | dinámico | Ancho en pixeles del dispositivo físico de referencia. Ver sistema de escalado más abajo |
| `resolution-height` | dinámico | Alto en pixeles del dispositivo físico de referencia |
| `scale-fontsize` | `"true"` | Escala automáticamente las fuentes según la resolución del dispositivo |
| `android-font-factor` | `"7"` | Factor de ajuste de fuentes para Android |
| `ios-font-factor` | `"7"` | Factor de ajuste de fuentes para iOS |
| `default-language` | `"javascript"` | Lenguaje de scripting. Siempre `"javascript"` en proyectos modernos |
| `load-wait` | `"false"` | Si es `"true"`, muestra una pantalla de espera durante la carga inicial de la app |
| `compatibility-mode` | `"false"` | **CRÍTICO:** Si es `"true"`, desactiva completamente todos los estilos CSS |
| `companycolor` | — | Color corporativo general (menús, pestañas, selecciones donde no haya color específico) |
| `forecolor` | `"#FFFFFF"` | Color de texto general de la aplicación |
| `sql-profiler` | `"false"` | Registra las consultas SQL con tiempos de ejecución. **Desactivar en producción** |
| `load-imgbk` | — | Imagen de fondo del EditView (NO es el splash de carga; el splash se pone con un fichero `splash.png` en la raíz del proyecto) |
| `application-max-priority` | `"false"` | Marca la app como prioritaria para evitar que el SO la cierre en segundo plano |
| `application-notification-title` | — | Título de la notificación persistente de la app en Android |
| `application-notification-text` | — | Texto de la notificación persistente de la app en Android |
| `gps-service-notification-title` | — | Título de la notificación del servicio GPS en segundo plano |
| `gps-service-notification-text` | — | Texto de la notificación del servicio GPS en segundo plano |
| `secure-window` | `"false"` | Si es `"true"`, impide capturar pantalla (screenshot) |
| `replica-debug` | `"false"` | Loguea información de debug del proceso de réplica |
| `autologon-username` | `"admin"` | Usuario para el autologin (cuando `autologon="true"`) |
| `autologon-password` | — | Contraseña para el autologin |

> **Atributos que NO van en `<app>`:**
> - `fullscreen` — es atributo de `<coll>` (oculta barras de estado en una pantalla concreta).
> - `sql-debug` — es atributo de `<coll>` (loguea las SQL de esa colección).

#### Atributo `conditions` en los subnodos `<style>`, `<entry-point>` y `<login-coll>`

El atributo `conditions` permite que un subnodo se aplique solo cuando se cumple una condición de plataforma, tamaño de pantalla u orientación. Formato: `PLATAFORMA:TAMANO:ORIENTACION` — solo se especifican las partes necesarias.

| Parte | Valores posibles |
|-------|-----------------|
| Plataforma | `android`, `ios`, `wm` (Windows Mobile), `bb` (BlackBerry), `wp` (Windows Phone) |
| Tamaño | `phone` (móvil estándar), `tablet`, `mini` (Android < 3.5"), `hiphone` (Android 4.5"–7") |
| Orientación | `vertical`, `horizontal` |

```xml
<!-- Base: se aplica siempre -->
<style url="default.css" strict-mode="true" />
<!-- Solo en movil orientacion horizontal -->
<style url="default_hor.css" conditions="phone:horizontal" strict-mode="true" />
<!-- Solo en iOS -->
<style url="default-ios.css" conditions="ios" strict-mode="true" />
<!-- Solo en tablet vertical -->
<style url="default_tablet.css" conditions="tablet:vertical" strict-mode="true" />
<!-- Solo en iPhone -->
<style url="default_iphone.css" conditions="ios:phone" strict-mode="true" />

<!-- Entry point distinto según dispositivo -->
<entry-point>
    <item name="EntradaApp" conditions="" />
    <item name="EntradaAppTablet" conditions="tablet:horizontal" />
</entry-point>
```

> **Regla:** El fichero `default.css` (sin `conditions`) se aplica **siempre** como base. Los demas CSS con `conditions` se aplican adicionalmente cuando se cumple la condición, sobreescribiendo los estilos base donde haya conflicto.

#### Que es `<entry-point>`

El nodo `<entry-point>` le indica a XOne **cual es la primera coleccion que debe abrirse** cuando el usuario entra en la app. Se ejecuta justo después del login (o directamente al arrancar si `autologon="true"`).

La colección apuntada por `<entry-point>` es siempre `special="true"` — no tiene tabla en BD. Puede ser una pantalla de bienvenida, un dashboard, un menú principal, etc. El nombre más habitual es `EntradaApp`. (No confundir con el splash: el splash es un fichero `splash.png` en la raíz, no una `<coll>`.)

```xml
<!-- Entry-point simple -->
<entry-point>
    <item name="EntradaApp" conditions="" />
</entry-point>

<!-- Entry-point con coleccion distinta según dispositivo -->
<entry-point>
    <item name="EntradaApp" conditions="" />
    <item name="EntradaAppTablet" conditions="tablet:horizontal" />
</entry-point>
```

> **Convencion:** Usar `EntradaApp` como nombre por defecto. Solo cambiar si la app arranca directamente en el menu principal (`MenuPrincipal`) sin pantalla de bienvenida.

#### Que es `<login-coll>`

El nodo `<login-coll>` le indica a XOne **cual es la coleccion que gestiona el proceso de autenticación**. XOne muestra esta coleccion **antes** del `<entry-point>`, y solo pasa al entry-point cuando el login es correcto.

La coleccion de login es siempre `special="true"`. Contiene el formulario de usuario y contrasena, y la lógica JavaScript que valida las credenciales.

```xml
<login-coll>
    <item name="LoginColl" conditions="" />
</login-coll>
```

**Flujo de arranque completo:**

```
[Arranque]
    |
    v
autologon="true"? ── SI ──> [entry-point] ──> App lista
    |
    NO
    |
    v
[login-coll] → usuario introduce usuario y contraseña
    |
    v
credenciales OK? ── SI ──> [entry-point] ──> App lista
    |
    NO
    |
    v
[login-coll] ← vuelve al login con mensaje de error
```

> **IMPORTANTE:** Si `autologon="false"` y no se define `<login-coll>`, XOne usa su pantalla de login interna por defecto, que no es personalizable. En apps de produccion **siempre** definir `<login-coll>` con una coleccion propia.

#### Pantalla de splash

El splash que se muestra durante la carga inicial de la app **NO es una `<coll>` XML** — es un fichero estático en la raíz del proyecto que el framework carga automáticamente desde `LoadAppActivity`.

**Convención:** poner un fichero `splash.png` en la carpeta raíz del proyecto.

El framework busca los siguientes ficheros, en este orden, y usa el primero que encuentre:

| Tipo | Ficheros (raíz del proyecto, por orden de prioridad) |
|------|------------------------------------------------------|
| Vídeo | `splash.3gp`, `splash.mp4` |
| Imagen | `splash.jpg`, `splash.png`, `splash.gif`, `splash.bmp`, `splash.webp`, `splash.apng` |

- Si no se encuentra ninguno, el framework usa una imagen de splash interna por defecto.
- Para vídeos (`.3gp` / `.mp4`), `LoadAppActivity` añade un botón "Saltar" automáticamente y oculta la barra de progreso y el mensaje.
- Para imágenes animadas: `.gif` se carga con `GifDrawable`; `.webp` animado se reproduce automáticamente en Android 9+ (`AnimatedImageDrawable`); `.apng` se decodifica con `PngReadHelper`.
- El ancho de la imagen se ajusta al 100% del ancho de la pantalla manteniendo el ratio.

**No confundir** con:
- `load-imgbk` en `<app>`: imagen de fondo del EditView (NO el splash).
- `EntradaApp.xne`: pantalla post-login que se abre tras autenticarse (NO el splash).

#### Leer y escribir los contactos del teléfono

XOne expone la agenda de contactos del dispositivo como una **fuente de datos consultable con SQL**, a través de un proveedor de datos especial. No hay que importar nada: el proveedor forma parte del framework. Se usa en tres pasos.

**1. Declarar la conexión** en el nodo `<app>` (en `app.xml`):

```xml
<connection name="ContactsConnection"
    connstring="Provider=Xone Remote Provider;ProgID=com.xone.db.impl.contacts.ContactsConnection" />
```

**2. Pedir el permiso** de contactos (en el nodo `<permissions>` de `app.xml`):

```xml
<permission name="contacts" />
```

**3. Crear una colección** que use esa conexión. La "tabla" se llama `Contacts`:

```xml
<coll name="Contacts"
    sql="SELECT id,name,email,phone,photo,photo_thumbnail FROM Contacts"
    connection="ContactsConnection"
    idfieldname="id" stringkey="true"
    check-owner="false" dependent="false"
    show-toolbar="false" notab="true"
    onback="ui.getView(e.objItem).exit();">
    <group name="General" id="1">
        <prop visible="7" name="id"              type="T"   title="ID"              width="100%" labelbox="false" text-border="false" />
        <prop visible="7" name="name"            type="T"   title="Name"            width="100%" labelbox="false" text-border="false" />
        <prop visible="7" name="email"           type="T"   title="Email"           width="100%" labelbox="false" text-border="false" />
        <prop visible="7" name="phone"           type="T"   title="Phone"           width="100%" labelbox="false" text-border="false" />
        <prop visible="7" name="photo"           type="IMG" title="Photo"           width="100%" height="35%" keep-aspect-ratio="true" />
        <prop visible="7" name="photo_thumbnail" type="IMG" title="Photo thumbnail" width="100%" height="35%" keep-aspect-ratio="true" />
    </group>
</coll>
```

**Campos disponibles en el SELECT** (tabla `Contacts`):

| Campo | Tipo prop | Contenido |
|-------|-----------|-----------|
| `id` | `T` | Identificador del contacto. Es la clave de la coll (`idfieldname="id"` + `stringkey="true"`). |
| `name` | `T` | Nombre a mostrar del contacto. |
| `email` | `T` | Primer email del contacto. |
| `phone` | `T` | Primer teléfono del contacto (vacío si el contacto no tiene ninguno). |
| `photo` | `IMG` | Foto en alta resolución. El proveedor la vuelca a un fichero en la carpeta `files` del proyecto y devuelve el nombre del fichero; por eso se mapea a `type="IMG"`. |
| `photo_thumbnail` | `IMG` | Miniatura de la foto, con el mismo mecanismo. |

**Notas de la fuente de contactos:**

- La consulta devuelve **como máximo 100 contactos**. Usa `WHERE` (filtro) y `ORDER BY` (orden) en el SQL para acotar y ordenar el resultado; los nombres de campo del filtro y el orden son los mismos de la tabla (`name`, `phone`, etc.).
- El SELECT debe incluir al menos uno de los campos anteriores; en caso contrario no devuelve resultados.
- **Alta y modificación:** un `INSERT`/`UPDATE` sobre `Contacts` crea o actualiza un contacto en la agenda del dispositivo. Además de `name`, `phone` y `email`, al escribir se aceptan `landlinephone` (teléfono fijo), `workphone` (teléfono de trabajo), `company` (empresa) y `job` (puesto). El **borrado de contactos no está soportado**.

#### Conexiones remotas: los `ProgID` que el framework trae de fábrica

Una `<connection>` con `Provider=Xone Remote Provider` y un `ProgID` conecta la app a una
fuente que **no es una base de datos local**, y las colls la consultan **con SQL normal**: basta
`connection="<nombre>"` en la coll. La lista completa la decide el runtime
(`CXoneApplication::CreateRemoteDataConnector`), y son éstos:

| `ProgID` | Qué conecta |
|---|---|
| `com.xone.db.json.JSONConnection` | una **API JSON** por HTTP |
| `com.xone.db.soa.SOAConnection` | un servicio **SOAP** |
| `com.xone.db.impl.xmlrpc.XMLRPCConnection` | un servicio **XML-RPC** |
| `com.xone.db.impl.contacts.ContactsConnection` | la **agenda de contactos** del dispositivo |
| `com.xone.db.impl.replicafiles.RplFilesConnection` | **réplica de ficheros** (solo Android) |
| `cgsproxy.cproxy` · `cgsrss.cproxy` | proxy HTTP genérico · proxy RSS (heredados) |

Un `ProgID` que no esté en esa lista **no crea conexión**: el runtime devuelve `NULL` y la
conexión no existe. No los inventes.

##### La conexión JSON, entera

Es la que se usa para hablar con una API propia sin escribir un `addItem` a mano por cada
registro. La coll declara su `sql` como si la API fuera una tabla, y el proveedor la traduce.

**Declarada en `app.xml`**, para toda la app:

```xml
<connection name="DatosOnline" datemask="ymd"
  connstring="Provider=Xone Remote Provider;Data Source=https://api.ejemplo.com/endpoint;ProgID=com.xone.db.json.JSONConnection;Content-Type=application/json;Timeout=15;Security Level=2;Auth=true;LoginCall=true;JWTCall=true;Remote Broker=false;" />
```

**O dentro de la propia `.xne`**, si solo la usa esa coll — el nodo `<connection>` vale también
ahí, y es lo que conviene cuando la fuente es de una pantalla y no del proyecto:

```xml
<coll name="Pedidos" objname="Pedidos" updateobj="Pedidos"
      progid="ASData.CASBasicDataObj" connection="json" loadall="false">
  <connection name="json" datemask="ymd"
    connstring="Provider=Xone Remote Provider;Data Source=http://servidor/json/default.aspx;ProgID=com.xone.db.json.JSONConnection;Timeout=60;Security Level=0" />
  <group name="General" id="1">
    <prop name="CLIENTE" type="T" visible="7" />
    <prop name="TOTAL" type="N" visible="7" />
  </group>
</coll>
```

**Los parámetros del `connstring`**, tal como los lee el runtime
(`CXoneJsonConnectionData`). Los que no aparecen se quedan en su valor por defecto:

| Parámetro | Qué hace |
|---|---|
| `Data Source` | la **URL** del endpoint |
| `Timeout` | segundos de espera; entero |
| `Security Level` | nivel de seguridad del canal; entero (`0` en los ejemplos abiertos, `2` con autenticación) |
| `Content-Type` | cabecera de la petición, p. ej. `application/json` |
| `HttpMethod` | método HTTP a usar |
| `Auth` | `true`/`false` — la conexión autentica |
| `LoginCall` | `true`/`false` — hace la llamada de login |
| `JWTCall` | `true`/`false` — el token viaja como JWT |
| `User Id` / `Password` | credenciales (alias equivalentes: `xoneuser` / `xonepass`) |
| `Remote Broker` | `true`/`false` — habla contra el broker remoto |
| `Remote Mapped` | URL alternativa del broker mapeado |
| `postencode` | `true`/`false` — codifica el cuerpo del POST |
| `sqlquery` | `false` desactiva el modo de consulta SQL |
| `AllowUnsafeCertificates` | `true` acepta certificados no válidos. **En producción, `false`** |
| `EnableCertificatePinning` | `true` activa pinning de certificado |
| `LocalCertificatePath` | ruta del certificado local para el pinning |

**Nunca dejes credenciales escritas en el `connstring` de un proyecto que se entrega**, ni
`AllowUnsafeCertificates=true`: las dos cosas viajan en claro dentro del `.xne` o del `app.xml`.

#### Sistema de Escalado, Resoluciones y Tamaños de UI

**Como funciona `resolution-width` y `resolution-height`**

Estos atributos definen la resolución del dispositivo físico con el que se diseña y prueba la app. No son valores fijos — deben coincidir exactamente con la resolución real del dispositivo de referencia usado en el desarrollo.

Cuando la app se ejecuta en un dispositivo con distinta resolución, XOne escala automáticamente todos los tamaños con esta formula:

```
tamaño_real_px = valor_p × (resolucion_real_dispositivo / resolution-width)
```

**Valores típicos según dispositivo de referencia:**

| Dispositivo de referencia | `resolution-width` | `resolution-height` |
|--------------------------|-------------------|---------------------|
| HDPI Compact             | `"480"`           | `"800"`             |
| XHDPI Standard           | `"720"`           | `"1280"`            |
| XXHDPI Classic (emulador XOneStudio por defecto) | `"1080"` | `"1920"`            |
| Dispositivo típico actual | `"1080"`          | `"1920"`            |
| XXXHDPI Premium          | `"1440"`          | `"2560"`            |

> **CRITICO:** Si `resolution-width` no coincide con la resolución del dispositivo con el que se diseña, todos los elementos quedaran desproporcionados. El emulador de XOneStudio usa `1080x1920` por defecto — si el dispositivo físico real es distinto (por ejemplo `1080x2220`), hay que cambiar estos valores en `app.xml`.

**La unidad `p` (pixel en el dispositivo de referencia)**

Todas las dimensiones en XOne se expresan en `p`. En el dispositivo de referencia (`resolution-width` × `resolution-height`) **`1p = 1px` real**. En cualquier otro dispositivo XOne aplica el escalado automáticamente con la fórmula del bloque anterior.

> **CRÍTICO: `p` ≠ Material `dp`.** Es un error común — y conduce a barras/botones ~3× más pequeños de lo necesario en 1080×1920. Material `56dp` (toolbar estándar) **NO** es `56p`: en xxhdpi (1080×1920, density 3×) son **~168p** (workflow estándar: 164p). Si vienes de Material Design, multiplica los `dp` por **~3** para obtener el valor `p` correcto en 1080×1920.

```xml
<!-- Correcto: siempre usar p o % -->
<frame name="frmTopBar" width="100%" height="164p" />
<prop name="MAP_BTN" width="60%" height="124p" />

<!-- Incorrecto: NUNCA usar px, em, rem, dp. Tampoco asumir que p = Material dp -->
```

**Tabla de tamaños estándar** (para `resolution-width="1080"` / `resolution-height="1920"`)

Los siguientes valores funcionan correctamente en proyectos reales diseñados para este dispositivo. Si se usa otra resolución de referencia, escalar proporcionalmente con la formula.

| Elemento | `height` | `width` | Notas |
|----------|----------|---------|-------|
| TopBar / BottomBar | `164p` | `100%` | Barra de título superior o inferior |
| Header fijo completo (topBar + tabs) | `404p` | `100%` | Topbar + barra de estado + pestañas |
| Botón de acción principal (pill) | `124p` | `43–60%` | "Aceptar", "Guardar", "Iniciar viaje" |
| Botón principal ancho completo | `124p` | `92%` | Botón único centrado en footer |
| Botón de pestaña / tab | `144p` | `33–50%` | Pestañas tipo "Activa", "Mis OTs" |
| Campo de texto editable `type="T"` | `144p` | `80–92%` | Campos de formulario estándar |
| Label `type="L"` estándar | `96p` | `100%` | Etiquetas de sección |
| Icono de navegación `type="B"` | `104p` | `104p` | Botones con icono cuadrado en topbar |
| Icono de acción grande | `150p` | `150p` | Camara, galería, adjuntar |
| Modal / popup | `-2` (alto dinámico) | `840p` | Dialogo centrado (~78% del ancho) |
| Separador fino | `4p` | `100%` | Linea divisoria entre secciones |
| Separador medio | `8p` | `100%` | Indicador de pestaña activa |
| Margen entre elementos `tmargin` | `30p` | — | Espacio entre elementos del mismo bloque |
| Margen entre bloques `tmargin` | `50p` | — | Espacio entre secciones distintas |
| Margen lateral contenido `lmargin` | `50p` | — | Sangria del contenido respecto al borde |

**Sistema de fuentes**

El tamaño de fuente se controla con `fontsize` en el prop, o idealmente via clases CSS para reutilizarlo en todo el proyecto. El nombre de la fuente puede ser cualquier tipografía incluida en el proyecto (`Roboto`, `OpenSans`, etc.) — el fichero `.ttf` o `.otf` debe estar en la carpeta `fonts/` del proyecto.

```css
/* Definición en CSS — lo mas recomendable */
.font5  { fontsize: 5;  text-fontsize: 5;  labelfontsize: 5;  label-fontsize: 5;  }
.font7  { fontsize: 7;  text-fontsize: 7;  labelfontsize: 7;  label-fontsize: 7;  }
.font10 { fontsize: 10; text-fontsize: 10; labelfontsize: 10; label-fontsize: 10; }
.font-bold    { fontname: Roboto-Bold; }
.font-regular { fontname: Roboto-Regular; }
```

```xml
<!-- Uso en el prop via clase CSS — recomendado -->
<prop name="MAP_TITULO" type="L" class="font7 font-bold" />

<!-- También valido: fontsize directamente en el prop -->
<prop name="MAP_TITULO" type="L" fontsize="7" />
```

| Rango | Uso típico |
|-------|------------|
| `fontsize` 1–2 | Textos mínimos, contadores, notas |
| `fontsize` 3–4 | Textos secundarios, metadatos, fechas |
| `fontsize` 5 | Texto estándar de campos y labels — **el más usado** |
| `fontsize` 6–7 | Títulos de sección, pestañas, números destacados |
| `fontsize` 8–9 | Títulos de tarjeta, subtítulos de pantalla |
| `fontsize` 10–11 | Títulos de topbar, cabeceras de modal |
| `fontsize` 12 | Títulos grandes, nombre de la app |

#### Ejemplo Real: Proyecto UseCars

Este es el `app.xml` del proyecto de ejemplo UseCars (tipo Uber):

```xml
<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<xml>
    <app
        prefix="gen"
        version="1.0.0"
        debug="true"
        autologon="false"
        screen-orientation="portrait"
        resolution-width="1080"
        resolution-height="1920"
        scale-fontsize="true"
        android-font-factor="7"
        ios-font-factor="8"
        default-language="javascript"
        application-notification-title="UseCars"
        application-max-priority="true">

        <entry-point>
            <item name="EntradaApp" conditions="" />
        </entry-point>

        <login-coll>
            <item name="Login" conditions="" />
        </login-coll>

        <!-- Se pueden incluir multiples archivos CSS -->
        <style url="default.css" encoding="UTF-8" />
        <style url="colors.css" encoding="UTF-8" />

        <!-- Se pueden incluir multiples archivos JS -->
        <include file="functions.js" language="javascript" encoding="UTF-8"/>
        <include file="viajes.js" language="javascript" encoding="UTF-8"/>
        <include file="ubicacion.js" language="javascript" encoding="UTF-8"/>
    </app>
</xml>
```

> **Tip:** Puedes incluir multiples archivos CSS y JS. Es una buena práctica separar estilos por tema (colores, layout) y scripts por funcionalidad (login, negocio, utilidades).

### 4.2 app.ini

El archivo `app.ini` contiene los metadatos básicos de la aplicación en formato INI (clave=valor). Es más simple que `app.xml` pero igualmente necesario.

```ini
Name=MiProyecto
Title=Mi Proyecto XOne
Caption=Descripción corta de la aplicacion
Icon=app_icon.png
IconFolder=icons
FilesFolder=files
HideSplash=false
```

#### Campos Explicados

| Campo | Descripción | Obligatorio |
|-------|-------------|-------------|
| `Name` | Nombre interno del proyecto (sin espacios ni caracteres especiales) | Si |
| `Title` | Título visible de la aplicación | Recomendado |
| `Caption` | Subtítulo o descripción corta | Opcional |
| `Icon` | Nombre del archivo del icono de la app (debe estar en `icons/`) | Recomendado |
| `IconFolder` | Carpeta de iconos. **Siempre `icons`** | Si |
| `FilesFolder` | Carpeta de archivos dinámicos. **Siempre `files`** | Si |
| `HideSplash` | Si es `true`, no muestra la pantalla de carga | Opcional |

#### Ejemplo Real: Proyecto UseCars

```ini
Name=UseCars
Title=UseCars
Caption=Tu viaje, a un toque de distancia
Icon=app_icon.png
IconFolder=icons
FilesFolder=files
HideSplash=false
```

### 4.3 mappings.xne

El archivo `mappings.xne` es uno de los más importantes y, al mismo tiempo, uno de los que más errores genera en principiantes. Su proposito es **definir exclusivamente las colecciones base del sistema**: `Empresas` y `Usuarios`.

#### Regla Fundamental

> **IMPORTANTE:** El archivo `mappings.xne` SOLO debe contener las colecciones `Empresas` y `Usuarios`. NUNCA pongas otras colecciones aquí. Las colecciones adicionales (Productos, Pedidos, Tareas, etc.) van en archivos `.xne` separados.

#### Por que solo Empresas y Usuarios?

Estas dos colecciones son especiales porque:
- Son necesarias para el sistema de autenticación y login
- Son requeridas por el motor de sincronización/replica
- El framework las busca automáticamente en `mappings.xne`
- Definen la estructura organizativa básica (empresa -> usuarios)

#### Campos Obligatorios

**Coleccion Empresas:**

| Campo | Tipo | Visible | Descripción |
|-------|------|---------|-------------|
| `CODIGO` | `N` | `7` | Identificador numérico de la empresa |
| `NOMBRE` | `T` | `7` | Nombre de la empresa (fieldsize="150") |

**Coleccion Usuarios:**

| Campo | Tipo | Visible | Descripción                                                                                                               |
|-------|------|---------|---------------------------------------------------------------------------------------------------------------------------|
| `CODIGO` | `N` | `7` | Identificador numérico del usuario                                                                                        |
| `NOMBRE` | `T` | `7` | Nombre del usuario (fieldsize="100")                                                                                      |
| `IDEMPRESA` | `N` | `7` | Relación con la empresa (mapcol="Empresas")                                                                               |
| `LOGIN` | `T` | `7` | Nombre de usuario para login (fieldsize="50")                                                                             |
| `PWD` | `X` | `0` | Contrasena (tipo X = enmascarado, fieldsize="100"). El nombre del campo DEBE ser `PWD` — El framework lo lee literalmente |

> **No hace falta declarar `ID` ni `ROWID` como `<prop>`** (ni aquí ni en ninguna coll): son columnas de plataforma que XOne gestiona automáticamente — el `ID` es la clave autonumérica y el `ROWID` el GUID de 32 hex de sincronización que el framework autogenera en cada alta. Declararlas es válido pero redundante (mejor omitirlas por limpieza). En el `sql=` de la coll, el `ID` sí se rescata en el SELECT; el `ROWID` no es necesario.

#### Ejemplo Completo con Explicaciones

```xml
<?xml version="1.0" encoding="utf-8"?>
<xml>
    <!--
        Cabecera del mappings.xne
        El atributo prefix DEBE coincidir con el de app.xml
    -->
    <app prefix="gen" version="1.0.0" debug="true" default-language="javascript">
        <style url="default.css" />
    </app>

    <!--
        collprops type="general" envuelve todas las colecciones
        definidas en este archivo
    -->
    <collprops type="general">

        <!--
            COLECCION: Empresas
            - Define las empresas/organizaciones del sistema
            - sql: usa ##PREF## para insertar el prefijo automaticamente
            - objname: nombre de la tabla en BD (genera gen_empresas)
            - updateobj: nombre del objeto para operaciones de escritura
            - loadall: carga todos los registros al abrir
        -->
        <coll name="Empresas"
              sql="SELECT * FROM ##PREF##Empresas"
              objname="Empresas"
              updateobj="Empresas"
              loadall="true">
            <group name="General" id="1">
                <!--
                    ID y ROWID los gestiona el framework: no hace falta declararlos como <prop>
                    (declararlos es válido pero redundante).
                    - ID: clave autonumérica de la tabla
                    - ROWID: GUID de 32 caracteres hex de sincronización/replica que el
                      framework autogenera en cada alta (ej: "a1b2c3d4e5f6789012345678abcdef12")
                -->

                <!-- === CAMPOS OBLIGATORIOS === -->
                <prop name="CODIGO" type="N" visible="7" />
                <prop name="NOMBRE" type="T" visible="7" fieldsize="150" />

                <!-- === CAMPOS OPCIONALES (según necesidades) === -->
                <prop name="CIF" type="T" visible="7" fieldsize="20" />
                <prop name="DIRECCION" type="T" visible="7" fieldsize="255" />
                <prop name="TELEFONO" type="T" visible="7" fieldsize="20" />
                <prop name="EMAIL" type="T" visible="7" fieldsize="150" />
                <prop name="ACTIVO" type="NC" visible="7" />
            </group>
        </coll>

        <!--
            COLECCION: Usuarios
            - Define los usuarios que pueden hacer login
            - Tiene relacion con Empresas via IDEMPRESA
        -->
        <coll name="Usuarios"
              sql="SELECT * FROM ##PREF##Usuarios"
              objname="Usuarios"
              updateobj="Usuarios"
              loadall="true">
            <group name="General" id="1">

                <!-- === CAMPOS OBLIGATORIOS === -->
                <prop name="CODIGO" type="N" visible="7" />
                <prop name="NOMBRE" type="T" visible="7" fieldsize="100" />
                <!--
                    IDEMPRESA: Relacion con la tabla Empresas
                    - mapcol="Empresas" indica la coleccion relacionada
                    - mapfld="ID" indica el campo de enlace
                -->
                <prop name="IDEMPRESA" type="N" visible="7"
                      mapcol="Empresas" mapfld="ID" />
                <prop name="LOGIN" type="T" visible="7" fieldsize="50" />
                <!--
                    PWD: Tipo X para campos de contraseña
                    - El nombre DEBE ser "PWD" — El framework lo lee literalmente
                    - visible="0" para que no se muestre en listas
                    - El tipo X enmascara el contenido con asteriscos
                -->
                <prop name="PWD" type="X" visible="0" fieldsize="100" />

                <!-- === CAMPOS OPCIONALES === -->
                <prop name="EMAIL" type="T" visible="7" fieldsize="150" />
                <prop name="TELEFONO" type="T" visible="7" fieldsize="20" />
                <prop name="ROL" type="T" visible="7" fieldsize="20" />
                <prop name="ACTIVO" type="NC" visible="7" />
            </group>
        </coll>

        <!--
            OTRAS COLECCIONES: En archivos .xne separados
            NO agregarlas aquí. Cada una va en su propio archivo:
            - Productos.xne
            - Pedidos.xne
            - Clientes.xne
            - etc.
        -->

    </collprops>
</xml>
```

#### Que pasa con las demas colecciones?

Cada coleccion adicional se define en su propio archivo `.xne`. Por ejemplo, `Tareas.xne`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<!--
    Coleccion: Tareas
    Descripción: Almacena las tareas del sistema
-->
<coll name="Tareas"
      sql="SELECT * FROM ##PREF##Tareas"
      objname="Tareas"
      updateobj="Tareas"
      loadall="true">
    <group name="General" id="1">
        <prop name="TITULO" type="T" visible="7" fieldsize="200" />
        <prop name="DESCRIPCION" type="T" visible="7" fieldsize="500" />
        <prop name="ESTADO" type="T" visible="7" fieldsize="20" />
        <prop name="PRIORIDAD" type="N" visible="7" />
        <prop name="FECHA_CREACION" type="DT" visible="7" />
        <prop name="FECHA_LIMITE" type="D" visible="7" />
    </group>
</coll>
```

> Para profundizar en la definición de colecciones y la estructura XML completa, consulta el tópico 02 - Estructura XML y Colecciones.
