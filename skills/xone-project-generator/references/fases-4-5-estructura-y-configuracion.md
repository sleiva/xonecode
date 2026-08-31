# Generación XOne — Fases 4-5: estructura de carpetas y configuración

> Fuente: `xone/v2/xone-project-generator/references/xone-project-generation-workflow.md` §5–§6. Referencia de la skill; el índice está en [../SKILL.md](../SKILL.md).

Contenido: §5 Fase 4 estructura de carpetas, ficheros raíz obligatorios, splash y la regla .xne vs .xml generado · §6 Fase 5 app.xml completo, escalado y resoluciones, app.ini, license.ini y mappings.xne

---

## 5. Fase 4: Creación de Estructura de Carpetas

### 5.1 Objetivo

Crear la estructura de carpetas y ficheros raiz obligatorios del proyecto.

### 5.2 Comandos de Creación

```bash
# Crear estructura completa
mkdir -p NombreProyecto
cd NombreProyecto
mkdir -p bd icons files fonts
```

### 5.3 Estructura Completa Resultante

```
NombreProyecto/
├── app.xml                      # [OBLIGATORIO] Configuración global
├── app.ini                      # [OBLIGATORIO] Metadatos
├── license.ini                  # [OBLIGATORIO] Licencia y conexion/replica
├── mappings.xne                 # [OBLIGATORIO] Solo Empresas y Usuarios
├── default.css                  # [OBLIGATORIO] Estilos globales
├── functions.js                 # [OBLIGATORIO] Funciones JavaScript
├── EntradaApp.xne               # [OBLIGATORIO] Punto de entrada (o MenuPrincipal.xne)
├── Consola.xne                  # [OBLIGATORIO] Consola tecnica siempre presente
├── Login.xne                    # [CONDICIONAL] Solo si autologon="false"
├── splash.png                   # [OPCIONAL] Imagen de splash de carga inicial
├── README.md                    # [OBLIGATORIO] Descripción del proyecto
│
├── [Coleccion].xne              # Un archivo por coleccion adicional
├── [Pantalla].xne               # Un archivo por pantalla de negocio
│
├── bd/                          # [OBLIGATORIO]
│   ├── gestion.db               # Se genera en Fase 11
│   └── README.md
├── icons/                       # [OBLIGATORIO]
│   ├── app_icon.png             # Se genera en Fase 11
│   └── README.md
├── files/                       # [OBLIGATORIO]
│   └── README.md
└── fonts/                       # [RECOMENDADO]
    └── README.md
```

### 5.4 Ficheros Raiz Obligatorios

| Fichero | Obligatorio | Generado en |
|---------|-------------|-------------|
| `app.xml` | Siempre | Fase 5 |
| `app.ini` | Siempre | Fase 5 |
| `license.ini` | Siempre | Fase 5 |
| `mappings.xne` | Siempre | Fase 5 |
| `default.css` | Siempre | Fase 3 |
| `functions.js` | Siempre | Fase 9 |
| `EntradaApp.xne` / `MenuPrincipal.xne` | Siempre (uno de los dos) | Fase 7 |
| `Consola.xne` | Siempre | Fase 7 |
| `Login.xne` | Solo si `autologon="false"` | Fase 7 |

### 5.4.1 Pantalla de splash

El splash que se muestra durante la carga inicial **no es una `<coll>` XML** — es un fichero estático en la raíz del proyecto. La carga la hace `LoadAppActivity` antes incluso de que arranque el sistema de colecciones.

**Convención:** poner un fichero `splash.png` en la carpeta raíz del proyecto.

El framework busca por orden los siguientes ficheros en la raíz y usa el primero que encuentre:

| Tipo | Ficheros (por orden de prioridad) |
|------|-----------------------------------|
| Vídeo | `splash.3gp`, `splash.mp4` |
| Imagen | `splash.jpg`, `splash.png`, `splash.gif`, `splash.bmp`, `splash.webp`, `splash.apng` |

- Si no hay ninguno, el framework usa un splash interno por defecto.
- Para vídeos, `LoadAppActivity` añade automáticamente un botón "Saltar".
- Imágenes animadas: `.gif` (`GifDrawable`), `.webp` animado (Android 9+), `.apng` (`PngReadHelper`).
- El ancho se ajusta al 100% de la pantalla manteniendo el ratio.

**No confundir** con:
- `load-imgbk` en `<app>`: imagen de fondo del EditView, no el splash.
- `EntradaApp.xne`: pantalla post-login que se abre tras autenticarse, no el splash.

### 5.5 Regla Crítica sobre Colecciones

```
mappings.xne     -> SOLO Empresas y Usuarios (nunca colecciones de negocio)
Productos.xne    -> Coleccion Productos (archivo separado)
Pedidos.xne      -> Coleccion Pedidos (archivo separado)
Clientes.xne     -> Coleccion Clientes (archivo separado)
```

### 5.6 Fuente `.xne` vs Salida Generada `.xml`

En XOne hay que distinguir claramente entre **ficheros fuente** (editables, lo que el agente crea/modifica) y **artefactos generados** (producidos automáticamente, se ignoran).

| Extensión | Rol | Quien lo edita | El agente... |
|-----------|-----|----------------|--------------|
| `.xne` | Fuente de colecciones y pantallas | Programador + agente IA | SI crea, SI edita, SI lee |
| `.xml` (colecciones/pantallas) | Artefacto generado por XOneStudio a partir del `.xne` | Nadie (se regenera) | NO crea, NO edita, NO lee, NO referencia |
| `app.xml` | Configuración global (única excepción — es fuente, no tiene `.xne` que lo genere) | Programador + agente IA | SI crea, SI edita, SI lee |
| `app.ini` | Metadatos de la app (fuente) | Programador + agente IA | SI crea, SI edita, SI lee |
| `.css` | Estilos propietarios (fuente) | Programador + agente IA | SI crea, SI edita, SI lee |
| `.js` | JavaScript (fuente) | Programador + agente IA | SI crea, SI edita, SI lee |

#### Por que existen los `.xml` de colecciones

XOneStudio genera automáticamente un `.xml` por cada `.xne` porque algunos motores de ejecución del framework todavia leen `.xml`. No son legacy ni restos de proyectos antiguos: se generan hoy, en proyectos nuevos. El plan de futuro es eliminarlos y dejar solo `.xne` en todas partes — el trabajo con IA ya se comporta como si esos `.xml` no existieran.

#### Regla operativa para el agente

> Al generar un proyecto nuevo: crear **solo** ficheros `.xne` para colecciones y pantallas (más `app.xml`, `app.ini`, `.css`, `.js` y recursos). **NUNCA** generar `.xml` de colecciones — eso lo hace XOneStudio automáticamente al abrir el proyecto.
>
> Al trabajar sobre un proyecto existente que ya tiene `.xne` y `.xml` conviviendo: tocar **solo** los `.xne`; los `.xml` de colecciones se ignoran por completo. Si se modifica un `.xml` a mano, el cambio se pierde en la siguiente regeneracion de XOneStudio.

---

## 6. Fase 5: Generación de Archivos de Configuración

### 5.1 app.xml - Configuración Global

```xml
<?xml version="1.0" encoding="iso-8859-15" standalone="yes"?>
<xml>
    <app
        prefix="gen"
        version="1.0.0"
        debug="false"
        autologon="false"
        screen-orientation="portrait"
        resolution-width="1080"
        resolution-height="1920"
        scale-fontsize="true"
        android-font-factor="7"
        ios-font-factor="8"
        default-language="javascript"
        companycolor="#2196F3"
        forecolor="#FFFFFF">

        <!-- Conexión a una base de datos alternativa. La base de datos principal NO necesita este nodo. -->
        <connection name="other_db" connstring="bd/other_db.db" />

        <!-- Estilos CSS — se pueden declarar varios según condicion de plataforma/tamano/orientacion -->
        <style url="default.css" strict-mode="true" />
        <style url="default_hor.css" conditions="phone:horizontal" strict-mode="true" />

        <!-- Scripts JavaScript -->
        <include file="functions.js" language="javascript" />

        <!-- Punto de entrada a la aplicación (tras login si lo hay) -->
        <entry-point>
            <item name="EntradaApp" conditions="" />
        </entry-point>

        <!-- Login personalizado — SOLO si autologon="false" -->
        <!-- <login-coll>
            <item name="LoginColl" conditions="" />
        </login-coll> -->

    </app>
</xml>
```

> **NOTA:** El encoding puede ser UTF-8 o `iso-8859-15` (coherente con los bytes; el motor respeta el declarado). El `entry-point` se define como nodo hijo, no como atributo del nodo `<app>`.

#### Atributos del nodo `<app>`

| Atributo | Descripción | Valor por Defecto |
|----------|-------------|-------------------|
| `prefix` | Define la macro `##PREF##` usada en todos los SQL de las colecciones. **IMPORTANTE:** al sustituirse, la macro inserta un **guion bajo** entre el prefix y el nombre de la tabla. Es decir, `##PREF##Empresas` se expande a `gen_empresas` (NO `genempresas`). En los `.xne` se escribe siempre `##PREF##Empresas` sin guion bajo (la macro lo añade ella), pero al generar DDL/DML literal (`bd/createdb.sql`, `bd/seed.sql`) y al ejecutar SQL directo sin la macro (`appData.executeSql`, `sqlManager.doRawQuery` con string literal), el nombre real de la tabla es `<prefix>_<NombreColeccion>` y hay que escribirlo con el underscore explícito. | `"gen"` — NUNCA cambiar sin indicacion explicita del usuario |
| `versión` | Versión del mappings. XOneStudio la incrementa automáticamente al guardar | `"1.0.0"` |
| `debug` | Modo depuracion — muestra más información en el dispositivo | `"false"` (produccion) / `"true"` (desarrollo) |
| `sql-debug` | Loguea todas las SQL ejecutadas por el framework | `"false"` |
| `sql-profiler` | Registra las consultas SQL con tiempos de ejecución. **Desactivar en produccion** | `"false"` |
| `autologon` | Si es `"true"`, salta el login y entra con el usuario `admin` sin password. **Solo desarrollo/pruebas — nunca en produccion** | `"false"` |
| `autologon-username` | Usuario para el autologin (cuando `autologon="true"`) | `"admin"` |
| `autologon-password` | Contraseña para el autologin | — |
| `screen-orientation` | Orientación forzada de pantalla | `"portrait"` / `"landscape"` / `"all"` |
| `resolution-width` | Ancho en pixeles del dispositivo físico de referencia. Ver sección 5.1b | `"1080"` |
| `resolution-height` | Alto en pixeles del dispositivo físico de referencia | `"1920"` |
| `scale-fontsize` | Escala el tamaño de fuente proporcionalmente al cambiar la resolución | `"true"` |
| `android-font-factor` | Factor de ajuste de fuentes para Android. **Se SUMA al `fontsize`** | `"7"` |
| `ios-font-factor` | Factor de ajuste de fuentes para iOS. **Se SUMA al `fontsize`** | `"8"` |
| `default-language` | Lenguaje por defecto para scripts | `"javascript"` |
| `companycolor` | Color corporativo general (menús, pestañas, selecciones) | — |
| `forecolor` | Color de texto general de la aplicación | `"#FFFFFF"` |
| `compatibility-mode` | **CRÍTICO:** Si es `"true"`, desactiva completamente todos los estilos CSS | `"false"` |
| `load-wait` | Si es `"true"`, muestra una pantalla de espera durante la carga inicial | `"false"` |
| `load-imgbk` | Imagen de fondo del EditView (NO es el splash de carga). El splash se pone con un fichero `splash.png` en la raíz del proyecto (ver §5.4.1 Pantalla de splash) | — |
| `application-max-priority` | Marca la app como prioritaria para evitar que el SO la cierre en segundo plano | `"false"` |
| `application-notification-title` | Título de la notificación persistente de la app en Android | — |
| `application-notification-text` | Texto de la notificación persistente de la app en Android | — |
| `gps-service-notification-title` | Título de la notificación del servicio GPS en segundo plano | — |
| `gps-service-notification-text` | Texto de la notificación del servicio GPS en segundo plano | — |
| `secure-window` | Si es `"true"`, impide capturar pantalla (screenshot) de la app | `"false"` |
| `entry-point` | (Forma alternativa como atributo) Nombre de la colección de entrada. Preferir el nodo `<entry-point>` | — |
| `replica-debug` | Loguea información de debug del proceso de réplica | `"false"` |

> **Atributos que NO van en `<app>`:**
> - `fullscreen` — es atributo de `<coll>` (oculta barras de estado en una pantalla concreta).
> - `sql-debug` — es atributo de `<coll>` (loguea las SQL de esa colección).

#### Subnodos del nodo `<app>`

**`<connection>`** — Define una conexión a base de datos:

```xml
<!-- Conexión a una base de datos alternativa. La base de datos principal NO necesita este nodo. -->
<connection name="other_db" connstring="bd/other_db.db" />

<!-- Conexión a BD de replica de ficheros (solo Android, si hay replica de ficheros) -->
<connection name="Info_ReplicaFiles"
    connstring="Provider=Xone Remote Provider;Data Source=local;
    ProgID=com.xone.db.impl.replicafiles.RplFilesConnection;
    DBMS Name=Ibd;User Name=sa;Password=;appname=ClientMobility;Timeout=60"
    prefix="" />

<!-- Contactos del teléfono como fuente de datos (proveedor del framework) -->
<connection name="ContactsConnection"
    connstring="Provider=Xone Remote Provider;ProgID=com.xone.db.impl.contacts.ContactsConnection" />
```

##### Leer y escribir los contactos del teléfono

XOne expone la agenda de contactos del dispositivo como una **fuente de datos consultable con SQL**, mediante el proveedor especial mostrado arriba (`ContactsConnection`). El proveedor forma parte del framework: no hay que activar ningún módulo, solo declarar la conexión, **pedir el permiso** y crear una colección que la use.

```xml
<!-- En app.xml: permiso obligatorio -->
<permission name="contacts" />
```

La "tabla" se llama `Contacts`. Una colección de ejemplo para listar/ver contactos:

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

- La consulta devuelve **como máximo 100 contactos**. Usa `WHERE` (filtro) y `ORDER BY` (orden) en el SQL para acotar y ordenar; los nombres de campo del filtro y el orden son los mismos de la tabla (`name`, `phone`, etc.).
- El SELECT debe incluir al menos uno de los campos anteriores; en caso contrario no devuelve resultados.
- **Alta y modificación:** un `INSERT`/`UPDATE` sobre `Contacts` crea o actualiza un contacto en la agenda del dispositivo. Además de `name`, `phone` y `email`, al escribir se aceptan `landlinephone` (teléfono fijo), `workphone` (teléfono de trabajo), `company` (empresa) y `job` (puesto). El **borrado de contactos no está soportado**.

**`<style>`** — Declara un fichero CSS. Se pueden declarar varios con distintas `conditions` para cargar estilos diferentes según plataforma, tamaño u orientación:

```xml
<!-- Base: se aplica siempre -->
<style url="default.css" strict-mode="true" />
<!-- Solo en movil orientacion horizontal -->
<style url="default_hor.css" conditions="phone:horizontal" strict-mode="true" />
<!-- Solo en iOS -->
<style url="default-ios.css" conditions="ios" strict-mode="true" />
<!-- Solo en tablet vertical -->
<style url="default_tablet.css" conditions="tablet:vertical" strict-mode="true" />
<!-- Solo en Android movil vertical -->
<style url="default_android_ver.css" conditions="android:phone:vertical" strict-mode="true" />
<!-- Solo en iPhone -->
<style url="default_iphone.css" conditions="ios:phone" strict-mode="true" />
<!-- Solo en iPad vertical -->
<style url="default_ipad_vertical.css" conditions="ios:tablet:vertical" strict-mode="true" />
```

| Atributo | Descripción |
|----------|-------------|
| `url` | Nombre del fichero CSS |
| `strict-mode` | Si es `"true"`, el framework parsea el CSS y reporta errores de sintaxis que podrian impedir que estilos posteriores se apliquen correctamente |
| `conditions` | Condición que debe cumplirse para que se aplique este CSS. Formato: `PLATAFORMA:TAMANO:ORIENTACION` |

**Valores posibles para `conditions`:**

| Parte | Valores |
|-------|---------|
| Plataforma | `android`, `ios`, `wm` (Windows Mobile), `bb` (BlackBerry), `wp` (Windows Phone) |
| Tamaño | `phone`, `tablet`, `mini` (Android < 3.5"), `hiphone` (Android 4.5"–7") |
| Orientación | `vertical`, `horizontal` |

> **Regla:** El fichero `default.css` (sin `conditions`) se aplica **siempre** como base. Los demas CSS con `conditions` se aplican adicionalmente cuando se cumple la condición, sobreescribiendo los estilos base donde haya conflicto.

**`<include>`** — Incluye un fichero de script:

```xml
<include file="functions.js" language="javascript" />
```

**`<entry-point>`** — Indica a XOne cual es la primera coleccion que se abre cuando el usuario entra en la app (tras el login, o directamente si `autologon="true"`). La coleccion apuntada es siempre `special="true"`. Nombre habitual: `EntradaApp`.

```xml
<!-- Simple: siempre la misma coleccion de entrada -->
<entry-point>
    <item name="EntradaApp" conditions="" />
</entry-point>

<!-- Con condiciones: coleccion distinta según dispositivo -->
<entry-point>
    <item name="EntradaApp" conditions="" />
    <item name="EntradaAppTablet" conditions="tablet:horizontal" />
</entry-point>
```

**`<login-coll>`** — Indica a XOne cual es la coleccion que gestiona la autenticación del usuario. XOne la muestra **antes** del `<entry-point>` y solo pasa al entry-point cuando las credenciales son correctas. Solo necesario si `autologon="false"`. La coleccion es siempre `special="true"`.

```xml
<login-coll>
    <item name="LoginColl" conditions="" />
</login-coll>
```

**Flujo de arranque:**

```
[Arranque] → autologon="true"? → SI → [entry-point] → App lista
                    |
                    NO
                    |
             [login-coll] → credenciales OK? → SI → [entry-point] → App lista
                                    |
                                    NO
                             [login-coll] ← vuelve con error
```

> **REGLA:** Si `autologon="false"` y no se define `<login-coll>`, XOne usa su login interno no personalizable. En produccion siempre definir `<login-coll>`.

> **REGLA:** El atributo `prefix` SIEMPRE debe ser `"gen"` a menos que el usuario especifique explicitamente otro valor.


### 5.1b Sistema de Escalado, Resoluciones y Tamaños de UI

#### Como funciona `resolution-width` y `resolution-height`

Estos atributos definen la resolución del dispositivo físico con el que se diseña y prueba la app. No son valores fijos — deben coincidir exactamente con la resolución real del dispositivo de referencia.

Cuando la app se ejecuta en un dispositivo con distinta resolución, XOne escala automáticamente todos los tamaños con esta formula:

```
tamaño_real_px = valor_p × (resolucion_real_dispositivo / resolution-width)
```

**Valores típicos según dispositivo de referencia:**

| Dispositivo | `resolution-width` | `resolution-height` |
|-------------|-------------------|---------------------|
| HDPI Compact | `"480"` | `"800"` |
| XHDPI Standard | `"720"` | `"1280"` |
| XXHDPI Classic (emulador XOneStudio por defecto) | `"1080"` | `"1920"` |
| Dispositivo típico actual | `"1080"` | `"1920"` |
| XXXHDPI Premium | `"1440"` | `"2560"` |

> **CRITICO:** Si `resolution-width` no coincide con la resolución del dispositivo con el que se diseña, todos los elementos quedaran desproporcionados. El emulador de XOneStudio usa `1080x1920` por defecto — si el dispositivo físico real es distinto (por ejemplo `1080x2220`), hay que cambiar estos valores en `app.xml`.

#### La unidad `p` (puntos)

Todas las dimensiones en XOne se expresan en puntos (`p`). En el dispositivo de referencia `1p = 1px`. En cualquier otro dispositivo XOne aplica el escalado automáticamente.

```xml
<!-- Correcto: siempre usar p o % -->
<frame name="frmTopBar" width="100%" height="164p" />
<prop name="MAP_BTN" width="60%" height="124p" />

<!-- Incorrecto: NUNCA usar px, em, rem, dp -->
```

#### Tabla de tamaños estándar (para `resolution-width="1080"` / `resolution-height="1920"`)

Los siguientes valores funcionan correctamente en proyectos reales diseñados para este dispositivo. Si se usa otra resolución de referencia, escalar proporcionalmente con la formula anterior.

| Elemento | `height` | `width` | Notas |
|----------|----------|---------|-------|
| TopBar / BottomBar | `164p` | `100%` | Barra de título superior o inferior |
| Header fijo completo (topBar + tabs) | `404p` | `100%` | Topbar + barra de estado + pestañas |
| Botón de acción principal (pill) | `124p` | `43–60%` | "Aceptar", "Guardar", "Iniciar viaje" |
| Botón principal ancho completo | `124p` | `92%` | Botón único centrado en footer |
| Botón de pestaña / tab | `144p` | `33–50%` | Pestañas tipo "Activa", "Mis OTs" |
| Campo de texto editable `type="T"` | `144p` | `80–92%` | Campos de formulario estándar |
| Label `type="L"` estándar | `96p` | `100%` | Etiquetas de sección |
| Icono de navegación `type="B"` (cuadrado) | `104p` | `104p` | Botones con icono en topbar |
| Icono de acción grande | `150p` | `150p` | Camara, galería, adjuntar |
| Modal / popup | `-2` (alto dinámico) | `840p` | Dialogo centrado (~78% del ancho) |
| Separador fino | `4p` | `100%` | Linea divisoria entre secciones |
| Separador medio | `8p` | `100%` | Indicador de pestaña activa |
| Margen entre elementos `tmargin` | `30p` | — | Espacio entre elementos del mismo bloque |
| Margen entre bloques `tmargin` | `50p` | — | Espacio entre secciones distintas |
| Margen lateral contenido `lmargin` | `50p` | — | Sangria del contenido respecto al borde |

#### Sistema de fuentes

El tamaño de fuente se controla con `fontsize` en el prop, o idealmente via clases CSS para reutilizarlo en todo el proyecto. El nombre de la fuente puede ser cualquier tipografía incluida en el proyecto — el fichero `.ttf` o `.otf` debe estar en la carpeta `fonts/`.

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

| Rango de `fontsize` | Uso típico |
|--------------------|------------|
| 1–2 | Textos mínimos, contadores, notas |
| 3–4 | Textos secundarios, metadatos, fechas |
| 5 | Texto estándar de campos y labels — **el más usado** |
| 6–7 | Títulos de sección, pestañas, números destacados |
| 8–9 | Títulos de tarjeta, subtítulos de pantalla |
| 10–11 | Títulos de topbar, cabeceras de modal |
| 12 | Títulos grandes, nombre de la app |

### 5.2 app.ini - Metadatos

```ini
name=NombreProyecto
icon=icon.png
IconFolder=icons
FilesFolder=files
Title=Titulo de la Aplicación
Caption=Titulo de la Aplicación
LocationTrackingEnabled=false
LocationTrackingInterval=1800000
LocationTrackingMinimumAccuracy=-1
LocationTrackingSaveOnLocalDatabase=false
LocationTrackingReplicate=true
```

**Campos del app.ini:**

| Campo | Descripción | Obligatorio |
|-------|-------------|-------------|
| `name` | Nombre interno del proyecto | Si |
| `icon` | Nombre del fichero de icono de la app | Si |
| `IconFolder` | Carpeta de iconos. Siempre `icons` | Si |
| `FilesFolder` | Carpeta de ficheros adjuntos. Siempre `files` | Si |
| `Title` | Título visible de la aplicación | Recomendado |
| `Caption` | Subtítulo o descripción corta de la aplicación | Recomendado |
| `LocationTrackingEnabled` | Activa el tracking de localización en segundo plano | No |
| `LocationTrackingInterval` | Intervalo entre capturas de posición en milisegundos (por defecto 1800000 = 30 min) | No |
| `LocationTrackingMinimumAccuracy` | Precisión mínima aceptada en metros (-1 = sin limite) | No |
| `LocationTrackingSaveOnLocalDatabase` | Guarda las posiciones en la BD local | No |
| `LocationTrackingReplicate` | Replica las posiciones al servidor | No |

### 5.3 license.ini - Configuración de Conexión y Licencia

Fichero obligatorio que define la conexión a la base de datos, los parámetros de replica y la licencia de la aplicación.

```ini
Database=00000000
License=000000000000000000000000
Connstring=bd/gestion.db
HostName=
Interval=60
IntervalType=1
Timeout=30
ConnectionMode=direct
ServerPort=7757
FullDuplex=false
LogLevel=0
WriteLog=false
Disabled=true
```

**Campos del license.ini:**

| Campo | Descripción | Valor por Defecto |
|-------|-------------|-------------------|
| `Database` | Identificador de base de datos de la licencia | `00000000` |
| `License` | Clave de licencia de la aplicación | `000000000000000000000000` |
| `Connstring` | Ruta a la base de datos SQLite | `bd/gestion.db` |
| `HostName` | Host del servidor de replica (vacio = sin replica) | `` |
| `Interval` | Intervalo de sincronización en segundos | `60` |
| `IntervalType` | Tipo de intervalo (1 = segundos) | `1` |
| `Timeout` | Tiempo de espera de conexión en segundos | `30` |
| `ConnectionMode` | Modo de conexión (`direct` o `online`) | `direct` |
| `ServerPort` | Puerto del servidor de replica | `7757` |
| `FullDuplex` | Comunicación full duplex con el servidor | `false` |
| `LogLevel` | Nivel de log (0 = sin log) | `0` |
| `WriteLog` | Escribir log en fichero | `false` |
| `Disabled` | Deshabilitar replica (true = solo local) | `true` |

> **REGLA:** Para proyectos sin replica, dejar `HostName` vacio y `Disabled=true`. Los valores de `Database` y `License` son proporcionados por el cliente al activar la aplicación.

> **REGLA (tabla `master_replica_queue`):** El framework encola en `master_replica_queue` TODAS las operaciones de `save()` (INSERT/UPDATE/DELETE), **aunque la réplica esté deshabilitada** (`Disabled=true`). Si la tabla no existe en `gestion.db`, el primer `save()` falla con `no such table: master_replica_queue`. XOneStudio la crea al generar la BD; si la BD se crea por otra vía (p. ej. la herramienta de BD del MCP con `create`+`sync`, que NO la incluye), hay que crearla a mano:
> ```sql
> CREATE TABLE IF NOT EXISTS master_replica_queue (
>   ID INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
>   ROWID TEXT, OPERID TEXT, TIMESTAMP TEXT, OPER INTEGER,
>   SESSIONID INTEGER, MID INTEGER, SQL TEXT, DMID INTEGER,
>   CONDITIONAL INTEGER, TBL TEXT, TYPE INTEGER, APPNAME TEXT
> );
> ```
> Verificado en dispositivo: sin esta tabla ninguna coll de datos puede guardar.

### 5.4 mappings.xne - Colecciones Base

> **REGLA CRITICA:** Este archivo SOLO contiene las colecciones `Empresas` y `Usuarios`. Todas las demas colecciones van en archivos `.xne` separados sin excepción.

```xml
<?xml version="1.0" encoding="iso-8859-15"?>
<xml>
  <collprops type="general">

    <!-- COLECCION OBLIGATORIA: Empresas -->
    <coll name="Empresas" title="la empresa"
          sql="select e.* from ##PREF##empresa e"
          objname="empresa" updateobj="empresa"
          progid="ASGestion.CASEmpresa">
      <group name="General" id="1">
        <prop name="CODIGO" visible="3" type="N" fieldsize="12" />
        <prop name="NOMBRE" type="T" fieldsize="30" size="250" />
        <!-- Agregar aquí campos adicionales de Empresas si el proyecto lo requiere -->
      </group>
    </coll>

    <!-- COLECCION OBLIGATORIA: Usuarios -->
    <coll name="Usuarios" title="el usuario"
          sql="select u.* from ##PREF##usuarios u"
          objname="usuarios" updateobj="usuarios"
          progid="ASGestion.CASUser">
      <group name="General" id="1">
        <prop name="IDEMPRESA" visible="0" type="N" mapcol="Empresas" mapfld="ID" />
        <prop name="CODIGO" visible="3" type="T" fieldsize="10" size="50" />
        <prop name="LOGIN" visible="3" type="T" fieldsize="10" size="50" />
        <prop name="PWD" type="X" fieldsize="10" size="50" visible="0" />
        <prop name="NOMBRE" visible="3" type="T" fieldsize="30" size="50" />
        <!-- Agregar aquí campos adicionales de Usuarios si el proyecto lo requiere -->
      </group>
      <create>
        <action name="setval" field="IDEMPRESA" value="##ENTID##" />
      </create>
    </coll>

    <!-- EL RESTO DE COLECCIONES VAN EN FICHEROS .xne SEPARADOS -->

  </collprops>
</xml>
```

**Reglas críticas para mappings.xne:**

1. **Solo Empresas y Usuarios** — cualquier otra coleccion va en su propio `.xne`
2. **Encoding coherente** — UTF-8 (default del motor) o `iso-8859-15`; el declarado debe coincidir con los bytes del fichero
3. **`progid` solo en Empresas y Usuarios** — es OPCIONAL en el resto (sin él, objeto de datos genérico ≡ `ASData.CASBasicDataObj`). `ASGestion.CASEmpresa` para Empresas, `ASGestion.CASUser` para Usuarios
4. **`##PREF##` en todos los SQL** — nunca hardcodear el prefijo de tabla
5. **`objname` y `updateobj`** — obligatorios para persistencia en BD
6. **`ID` y `ROWID` los gestiona la plataforma** — ambos existen a nivel de BD (`ID` = clave primaria autoincremental; `ROWID` = GUID de 32 caracteres hex sin guiones, usado por XOne para la replica entre dispositivos) y XOne rellena sus valores solo. No hace falta declararlos como `<prop>` en el `<group>` (declararlos es válido pero redundante; mejor omitirlos por limpieza). En el SQL: **`ID` siempre se rescata en el SELECT** (`SELECT ID, ...`); el `ROWID` no es necesario en el SELECT
7. **Prefijo `MAP_`** — todo prop cuyo valor NO sea una columna de la tabla de `objname` debe nombrarse `MAP_ALGO`. El framework excluye los `MAP_*` de los `INSERT`/`UPDATE`, por lo que `MAP_loquesea` no existe ni debe existir como columna en BD. Se aplica en tres casos: (a) campos que vienen de un JOIN en el SQL de la coll, (b) props visibles enlazados via `linkedto` a un combo, (c) props puramente visuales sin origen de datos: etiquetas `L` (o su alias legacy `TL`), botones `B`, imágenes decorativas, valores calculados en runtime, estados de UI, buscadores temporales. Ver sección dedicada 6.2b
8. **Evento `<create>` en Usuarios** — asigna `##ENTID##` a `IDEMPRESA` automáticamente al crear un usuario
9. **Tipos validos** — solo los documentados en sección 3.3
10. **Visible bitmask** — valores típicos: 0 (oculto), 1 (edición), 3 (edición+lista), 7 (edición+lista+content), 8 (combo), 15 (todos). Ver sección 3.4
