# Generación XOne — Fase 7: plantillas de pantalla base

> Fuente: `xone/v2/xone-project-generator/references/xone-project-generation-workflow.md` L2269–2562. Referencia de la skill; el índice está en [../SKILL.md](../SKILL.md).

Contenido: §7.1-7.3 orden de generación y preguntas previas · §7.4 plantilla EntradaApp.xne (obligatoria) · §7.5 MenuPrincipal.xne · §7.6 Login.xne

---

### 7.1 Objetivo

Crear todas las pantallas de la aplicación como archivos `.xne` individuales. Cada pantalla define su UI, eventos y lógica.

Antes de generar pantallas, el agente debe responder estas preguntas clave:

### 7.2 Preguntas de Decisión Previas a la Generación

#### Pregunta 1: ¿La app tiene autologin o requiere login?

| Escenario | Configuración en app.xml | Pantallas a generar |
|-----------|--------------------------|---------------------|
| **Con login** | `autologon="false"` + nodo `<login-coll>` apuntando a `LoginColl` | Generar `Login.xne` |
| **Sin login / autologin** | `autologon="true"` | NO generar `Login.xne` |

```xml
<!-- app.xml CON login -->
<app autologon="false" ...>
    <login-coll>
        <item name="LoginColl" conditions="" />
    </login-coll>
    <entry-point>
        <item name="EntradaApp" conditions="" />
    </entry-point>
</app>

<!-- app.xml SIN login (autologin) -->
<app autologon="true" ...>
    <entry-point>
        <item name="EntradaApp" conditions="" />
    </entry-point>
</app>
```

#### Pregunta 2: ¿Cual es el punto de entrada de la app?

El punto de entrada es la primera coleccion que se muestra al usuario tras el arranque (o tras el login si lo hay). Se configura en el nodo `<entry-point>` de `app.xml`.

| Nombre habitual | Cuando usarlo |
|-----------------|---------------|
| `EntradaApp` | **El más usado.** Pantalla de bienvenida que luego navega al menu |
| `MenuPrincipal` | Cuando la app arranca directamente en el menu sin pantalla de bienvenida |

> **REGLA:** Preguntar siempre al usuario cual prefiere. Si no especifica, usar `EntradaApp` por convencion.

#### Pregunta 3: ¿La app necesita consola de replica?

**Siempre si.** La `ConsolaReplica` es una pantalla técnica obligatoria en todo proyecto XOne. Proporciona información del dispositivo, estado de la replica y herramientas de diagnostico. No es visible para el usuario final en produccion — se accede típicamente desde un botón oculto o menu de administracion.

### 7.3 Orden de Generación de Pantallas

Generar las pantallas en este orden:

| Orden | Pantalla | Archivo | Obligatoria |
|-------|----------|---------|-------------|
| 1 | Login | `Login.xne` | Solo si `autologon="false"` |
| 2 | Punto de entrada | `EntradaApp.xne` o `MenuPrincipal.xne` | **Si** |
| 3 | Consola | `Consola.xne` | **Si (siempre)**. Si la app usa replica: incluir todos los grupos (info replica, dispositivo, ficheros). Si no usa replica: incluir solo el grupo de información del dispositivo |
| 4 | Menu principal | `MenuPrincipal.xne` (si EntradaApp es el entry-point) | Según proyecto |
| 5+ | Pantallas de negocio | `Lista[Entidad].xne`, `Detalle[Entidad].xne`, etc. | Según requisitos |

**Pantallas de negocio comunes:**

| Pantalla | Archivo | Proposito |
|----------|---------|-----------|
| Lista | `Lista[Entidad].xne` | Listado de registros |
| Detalle | `Detalle[Entidad].xne` | Formulario de edición |
| Mapa | `Mapa[Entidad].xne` | Visualizacion en mapa |
| Configuración | `Configuración.xne` | Ajustes de la app |
| Dashboard | `Dashboard.xne` | Panel con gráficos |

### 7.4 Plantilla: EntradaApp.xne (OBLIGATORIA)

```xml
<?xml version="1.0" encoding="utf-8"?>
<!--
    Pantalla de entrada de la aplicación
    Esta es la primera pantalla que ve el usuario
-->
<coll name="EntradaApp" title="Bienvenido"
      special="true" notab="true" show-toolbar="false">

    <!-- Inicialización (se ejecuta una sola vez) -->
    <create>
        <action name="runscript">
            <script language="javascript">
                // Inicialización de la aplicación
            </script>
        </action>
    </create>

    <!-- Al abrir la pantalla, antes de pintar la UI -->
    <before-edit>
        <action name="runscript">
            <script language="javascript">
                // Código al abrir la pantalla
            </script>
        </action>
    </before-edit>

    <group name="grpPrincipal" id="1" class="groupNoTab">
        <!-- Header con logo -->
        <frame name="frmHeader" class="frameHeader">
            <prop name="imgLogo" type="IMG" visible="7"
                  width="200p" height="80p" align="center"
                  path="./icons/app_icon.png" />
        </frame>

        <!-- Contenido principal -->
        <frame name="frmBody" class="frameBody">
            <prop name="lblNombreApp" type="L" visible="7"
                  width="100%" height="50p" align="center"
                  class="textoTitulo" title="Nombre de la App" />

            <prop name="lblDescripcion" type="L" visible="7"
                  width="80%" height="30p" align="center"
                  class="textoSubtitulo" title="Descripción breve" />

            <prop name="btnEntrar" type="B" visible="7"
                  width="80%" height="50p" align="center"
                  class="btnPrimario" title="Entrar" tmargin="30p"
                  onclick="ui.openEditView('MenuPrincipal');" />
        </frame>

        <!-- Versión -->
        <frame name="frmFooter" class="frameFooter">
            <prop name="lblVersion" type="L" visible="7"
                  width="100%" height="30p" align="center"
                  class="textoSubtitulo" title="v1.0.0" />
        </frame>
    </group>

    <!-- Manejo del botón atrás -->
    <onback>
        <action name="runscript">
            <script language="javascript">
                if (confirmar("¿Desea salir de la aplicación?", "Salir")) {
                    appData.exit();
                }
            </script>
        </action>
    </onback>
</coll>
```

### 7.5 Plantilla: MenuPrincipal.xne

```xml
<?xml version="1.0" encoding="utf-8"?>
<!--
    Menu principal de la aplicación
    Muestra las opciones de navegacion
-->
<coll name="MenuPrincipal" title="Menu"
      special="true" notab="true" show-toolbar="false">

    <create>
        <action name="runscript">
            <script language="javascript">
                // Inicialización del menu
            </script>
        </action>
    </create>

    <group name="grpMenu" id="1" class="groupNoTab">
        <!-- Header -->
        <frame name="frmHeader" width="100%" height="120p"
               bgcolor="#2196F3" align="center">
            <prop name="lblTitulo" type="L" visible="7"
                  width="100%" height="50p" align="center"
                  forecolor="#FFFFFF" fontsize="18"
                  title="Menu Principal" />
        </frame>

        <!-- Opciones del menu -->
        <frame name="frmOpciones" width="100%" height="100%"
               scroll="true" bgcolor="#FFFFFF">

            <!-- Opción 1 -->
            <frame name="frmOpcion1" width="90%" height="80p"
                   align="center" tmargin="15p"
                   bgcolor="#F5F5F5" border-corner-radius="10">
                <prop name="imgOpcion1" type="IMG" visible="7"
                      width="48p" height="48p" lmargin="15p"
                      path="./icons/ic_opcion1.png" />
                <prop name="lblOpcion1" type="L" visible="7"
                      width="70%" height="48p" lmargin="15p"
                      newline="false" fontsize="14"
                      title="Opción 1" />
                <prop name="btnOpcion1" type="B" visible="7"
                      width="100%" height="100%"
                      bgcolor="#00000000"
                      onclick="ui.openEditView('ListaEntidad');" />
            </frame>

            <!-- Repetir para cada opción del menu -->
        </frame>
    </group>

    <onback>
        <action name="runscript">
            <script language="javascript">
                if (confirmar("¿Desea salir de la aplicación?", "Salir")) {
                    appData.exit();
                }
            </script>
        </action>
    </onback>
</coll>
```

### 7.6 Plantilla: Login.xne

```xml
<?xml version="1.0" encoding="utf-8"?>
<!--
    Pantalla de login
-->
<coll name="LoginColl" title="" special="true" notab="true"
      show-toolbar="false">

    <group name="grpLogin" id="1" class="groupNoTab">
        <frame name="frmLogin" width="100%" height="100%"
               bgcolor="#FFFFFF" align="center">

            <!-- Logo -->
            <prop name="imgLogo" type="IMG" visible="1"
                  width="200p" height="80p" align="center"
                  tmargin="150p" path="./icons/app_icon.png" />

            <!-- Campo usuario -->
            <prop name="MAP_USUARIO" type="T" visible="1"
                  width="80%" height="50p" align="center"
                  tmargin="80p" labelwidth="0"
                  floating-tooltip="true" tooltip="Usuario"
                  class="textoEditable" />

            <!-- Campo contraseña -->
            <prop name="MAP_PASSWORD" type="X" visible="1"
                  width="80%" height="50p" align="center"
                  tmargin="20p" labelwidth="0"
                  floating-tooltip="true" tooltip="Contraseña"
                  show-password-visibility-toggle="true"
                  class="textoEditable" />

            <!-- Botón login -->
            <prop name="btnLogin" type="B" visible="1"
                  width="80%" height="50p" align="center"
                  tmargin="40p" class="btnPrimario"
                  title="Iniciar Sesion"
                  method="executenode(aceptarLogin)" />
        </frame>
    </group>

    <!-- Evento de login -->
    <aceptarLogin>
        <action name="runscript">
            <script language="javascript">
                var sUsuario = cstr(self.MAP_USUARIO);
                var sPassword = cstr(self.MAP_PASSWORD);

                // Solo validamos el usuario: en XOne puede haber usuarios sin
                // contraseña (perfiles invitado, kiosco) y, si la contraseña es
                // incorrecta, el propio backend la rechaza vía onLoginFailed.
                if (isEmpty(sUsuario)) {
                    ui.showToast("Introduzca el usuario");
                    return;
                }

                appData.login({
                    userName: sUsuario,
                    password: sPassword,
                    entryPoint: "MenuPrincipal",
                    onLoginSuccessful: function() {
                        ui.showToast("Bienvenido!");
                    },
                    onLoginFailed: function() {
                        ui.showToast("Usuario o contraseña incorrectos");
                    }
                });
            </script>
        </action>
    </aceptarLogin>

    <onback>
        <action name="runscript">
            <script language="javascript">
                appData.exit();
            </script>
        </action>
    </onback>
</coll>
```

