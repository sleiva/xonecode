/**
 * El esqueleto de un proyecto XOne mínimo, como DATOS y sin tocar el disco.
 *
 * Todo el contenido sale del «Hola Mundo» de la documentación XOne
 * (`xone-help-docs`, topico 01 §9 y guia de UI §8.2): **nada inventado**. XOne
 * ignora en silencio lo desconocido, así que un atributo o una función
 * inventada no da error — da un bug mudo, y un esqueleto recién creado que no
 * arranca sería la peor primera impresión posible.
 *
 * La escritura en disco vive en `agent/crearProyecto.ts`: aquí solo se DECIDE
 * qué ficheros hay y qué llevan dentro, que es exactamente lo que se puede
 * probar sin conexión, sin simulador y sin clave (el invariante de `npm test`).
 */

export interface DatosDelProyecto {
  /** Nombre interno, sin espacios ni caracteres especiales (`Name=` del app.ini). */
  nombre: string;
  /** Título visible de la aplicación. */
  titulo: string;
  orientacion: "portrait" | "landscape";
  /** Con login: `autologon="false"`, `<login-coll>` en app.xml y `Login.xne`. */
  login: boolean;
}

export interface Ficha {
  /** Ruta relativa a la raíz del proyecto. */
  ruta: string;
  contenido: string;
}

/**
 * Las carpetas del runtime, VACÍAS y a propósito:
 *
 * - `bd/`: el `gestion.db` lo GENERA el simulador; un `.db` escrito a mano no
 *   sería una base de datos, sería un fichero que estorba.
 * - `icons/`: los PNG no se pueden generar aquí (salen de Material Icons
 *   convertidos con cairosvg). La carpeta existe porque `app.ini` la declara.
 * - `files/`: la carpeta de archivos dinámicos del runtime.
 */
export function carpetasDelEsqueleto(): string[] {
  return ["bd", "icons", "files"];
}

export function generarEsqueleto(datos: DatosDelProyecto): Ficha[] {
  const { nombre, titulo, orientacion, login } = datos;

  const appXml = `<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<xml>
    <app
        prefix="gen"
        version="1.0.0"
        debug="true"
        autologon="${login ? "false" : "true"}"
        screen-orientation="${orientacion}"
        resolution-width="1080"
        resolution-height="1920"
        scale-fontsize="true"
        android-font-factor="10"
        default-language="javascript">

        <connection name="main" connstring="bd/gestion.db" />

        <entry-point>
            <item name="EntradaApp" conditions="" />
        </entry-point>
${login ? `
        <!-- Pantalla de login -->
        <login-coll>
            <item name="Login" conditions="" />
        </login-coll>
` : ""}
        <style url="default.css" encoding="UTF-8" />
        <include file="functions.js" language="javascript" encoding="UTF-8"/>
    </app>
</xml>
`;

  const appIni = `Name=${nombre}
Title=${titulo}
Caption=${titulo}
Icon=app_icon.png
IconFolder=icons
FilesFolder=files
HideSplash=false
`;

  // Regla crítica de XOne: aquí SOLO Empresas y Usuarios. Las colecciones de
  // negocio van en `.xne` separados, y esa es justamente la primera conversación
  // que el agente puede tener con el usuario sobre su proyecto.
  const mappingsXne = `<?xml version="1.0" encoding="utf-8"?>
<xml>
    <app prefix="gen" version="1.0.0" debug="true" default-language="javascript">
        <style url="default.css" />
    </app>

    <collprops type="general">
        <coll name="Empresas"
              sql="SELECT * FROM ##PREF##Empresas"
              objname="Empresas"
              updateobj="Empresas"
              loadall="true">
            <group name="General" id="1">
                <prop name="ID" type="N" visible="0" />
                <prop name="CODIGO" type="N" visible="7" />
                <prop name="NOMBRE" type="T" visible="7" fieldsize="150" />
                <prop name="ROWID" type="T" visible="0" fieldsize="32" />
            </group>
        </coll>

        <coll name="Usuarios"
              sql="SELECT * FROM ##PREF##Usuarios"
              objname="Usuarios"
              updateobj="Usuarios"
              loadall="true">
            <group name="General" id="1">
                <prop name="ID" type="N" visible="0" />
                <prop name="CODIGO" type="N" visible="7" />
                <prop name="NOMBRE" type="T" visible="7" fieldsize="100" />
                <prop name="ID_EMPRESA" type="N" visible="7"
                      mapcol="Empresas" mapfld="ID" />
                <prop name="LOGIN" type="T" visible="7" fieldsize="50" />
                <prop name="PASSWORD" type="X" visible="0" fieldsize="100" />
                <prop name="ROWID" type="T" visible="0" fieldsize="32" />
            </group>
        </coll>
    </collprops>
</xml>
`;

  const defaultCss = `/* Configuracion global */
prop {
    fontname: Roboto-Regular.ttf;
    fontsize: 10;
    labelbox: false;
    label-wrap: true;
    text-border: false;
}

coll {
    notab: true;
    show-toolbar: false;
    group-swipe: false;
    editmask: 0;
}

/* Clases de layout */
.frameHeader {
    width: 100%;
    height: 120p;
    bgcolor: #2196F3;
    align: center;
}

.frameBody {
    width: 100%;
    height: 100%;
    scroll: true;
    bgcolor: #FFFFFF;
}

/* Clases de botones */
.btnPrimario {
    width: 90%;
    height: 50p;
    bgcolor: #2196F3;
    forecolor: #FFFFFF;
    border-corner-radius: 8;
    text-align: center;
    fontsize: 14;
}

/* Clases de texto */
.textoTitulo {
    fontsize: 18;
    forecolor: #212121;
    text-align: center;
}

.textoSubtitulo {
    fontsize: 14;
    forecolor: #757575;
    text-align: center;
}

/* Grupos sin pestana */
.groupNoTab {
    tab-visible: false;
}
`;

  const functionsJs = `/**
 * Funciones globales - ${titulo}
 */

/**
 * Verifica si un valor esta vacio
 */
function isEmpty(val) {
    return val === undefined || val === null || val === "";
}

/**
 * Muestra un mensaje de confirmacion Si/No
 */
function confirmar(mensaje, titulo) {
    titulo = titulo || "Confirmar";
    var nResult = ui.msgBox(mensaje, titulo, 4);
    return nResult == 6;
}

/**
 * Muestra un toast simple
 */
function mostrarToast(mensaje) {
    ui.showToast(mensaje);
}

/**
 * Cierra la pantalla actual
 */
function cerrarPantalla() {
    var window = ui.getView(self);
    if (window) {
        window.exit();
    }
}
${login ? `
/**
 * Login contra la coleccion Usuarios (patron de seguridad del wiki)
 */
function realizarLogin() {
    if (!validarRequerido(self.MAP_EMAIL, "Email")) return;
    if (!validarRequerido(self.MAP_PASSWORD, "Contrasena")) return;

    ui.showWaitDialog("Iniciando sesion...");

    var collUsuarios = appData.getCollection("Usuarios");
    var usuario = collUsuarios.findObject(
        "LOGIN = '" + self.MAP_EMAIL + "'"
    );

    ui.hideWaitDialog();

    if (usuario) {
        if (usuario.PASSWORD == self.MAP_PASSWORD) {
            appData.setGlobalMacro("##USERID##", usuario.ID);
            appData.setGlobalMacro("##USERNAME##", usuario.NOMBRE);
            ui.showToast("Bienvenido, " + usuario.NOMBRE);
            ui.openMenu("MenuPrincipal", self);
        } else {
            ui.showToast("Credenciales incorrectas");
        }
    } else {
        ui.showToast("Usuario no encontrado");
    }
}

function validarRequerido(valor, nombre) {
    if (!valor || valor.toString().length == 0) {
        ui.showToast("El campo " + nombre + " es obligatorio");
        return false;
    }
    return true;
}
` : ""}`;

  const entradaAppXne = `<?xml version="1.0" encoding="utf-8"?>
<coll name="EntradaApp" title="${titulo}"
      special="true" notab="true" show-toolbar="false">

    <create>
        <action name="runscript">
            <script language="javascript">
                // Ir directamente al menu
                ui.openMenu("MenuPrincipal", self);
            </script>
        </action>
    </create>

    <group name="grpPrincipal" id="1" class="groupNoTab">
        <frame name="frmBody" class="frameBody">
            <prop name="lblCargando" type="TL" visible="7"
                  width="100%" height="50p" align="center"
                  class="textoTitulo" title="Cargando..."/>
        </frame>
    </group>

    <onback>
        <action name="runscript">
            <script language="javascript">
                if (confirmar("Desea salir?", "Salir")) {
                    appData.exit();
                }
            </script>
        </action>
    </onback>
</coll>
`;

  // MenuPrincipal no es opcional en la práctica: el EntradaApp documentado lo
  // abre con ui.openMenu, así que sin él la app recién creada nacería rota.
  const menuPrincipalXne = `<?xml version="1.0" encoding="utf-8"?>
<coll name="MenuPrincipal" title="Menu Principal"
      special="true" notab="true" show-toolbar="false">

    <group name="grpMenu" id="1" class="groupNoTab">
        <frame name="frmHeader" class="frameHeader">
            <prop name="lblTitulo" type="TL" visible="7"
                  width="100%" height="60p" align="center"
                  forecolor="#FFFFFF" fontsize="20"
                  title="${titulo}"/>
        </frame>

        <frame name="frmBody" class="frameBody">
            <prop name="lblMensaje" type="TL" visible="7"
                  width="100%" height="80p" align="center"
                  class="textoTitulo" tmargin="40p"
                  title="Bienvenido a tu proyecto XOne!"/>

            <prop name="btnSaludo" type="B" visible="7"
                  width="80%" height="50p" align="center"
                  class="btnPrimario" title="Saludar" tmargin="40p"
                  onclick="ui.showToast('Hola desde XOne!');" />
        </frame>
    </group>

    <onback>
        <action name="runscript">
            <script language="javascript">
                if (confirmar("Desea salir de la aplicacion?", "Salir")) {
                    appData.exit();
                }
            </script>
        </action>
    </onback>
</coll>
`;

  const ficheros: Ficha[] = [
    { ruta: "app.xml", contenido: appXml },
    { ruta: "app.ini", contenido: appIni },
    { ruta: "mappings.xne", contenido: mappingsXne },
    { ruta: "default.css", contenido: defaultCss },
    { ruta: "functions.js", contenido: functionsJs },
    { ruta: "EntradaApp.xne", contenido: entradaAppXne },
    { ruta: "MenuPrincipal.xne", contenido: menuPrincipalXne },
  ];

  if (login) {
    ficheros.push({ ruta: "Login.xne", contenido: loginXne() });
  }

  return ficheros;
}

/**
 * La pantalla de login del patrón del wiki (topico 05 §9.1). Llama a
 * `realizarLogin()`, que va en `functions.js` cuando el proyecto lleva login —
 * la pantalla y el JS son del mismo patrón, no una mezcla.
 */
function loginXne(): string {
  return `<coll name="Login" title="Iniciar Sesion"
      notab="true" show-toolbar="false">

    <create>
        <script>
            self.MAP_EMAIL = "";
            self.MAP_PASSWORD = "";
        </script>
    </create>

    <group name="grpPrincipal" id="1" class="groupNoTab">
        <frame name="frmFormulario" width="100%" bgcolor="#FFFFFF">
            <prop name="MAP_EMAIL" type="T" visible="7"
                  width="90%" height="56p" align="center"
                  hint="tu@email.com"/>
            <prop name="MAP_PASSWORD" type="X" visible="7"
                  width="90%" height="56p" align="center"
                  hint="Tu contrasena"/>
            <prop name="btnLogin" type="B" visible="7"
                  width="90%" height="56p" align="center" tmargin="30p"
                  title="Iniciar Sesion"
                  onclick="realizarLogin();" />
        </frame>
    </group>

    <onback>
        <script>
            cerrarPantalla();
        </script>
    </onback>
</coll>
`;
}