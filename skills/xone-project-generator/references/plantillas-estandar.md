# Las tres plantillas estándar

> Referencia de `xone-project-generator`. Sale del `SKILL.md` para que lo
> esencial quepa en una lectura por omisión (100 líneas).

## Plantilla Estándar de Pantalla


```xml
<?xml version="1.0" encoding="iso-8859-15"?>
<coll name="NombrePantalla" title="Título" special="true" notab="true" show-toolbar="false">

    <!-- Inicializar la pantalla en before-edit, NUNCA en load -->
    <before-edit refresh="false" show-wait-dialog="false">
        <action name="runscript">
            <script language="javascript">
                // Inicializar campos y datos
                self.MAP_TITULO = "Mi pantalla";
            </script>
        </action>
    </before-edit>

    <group name="grpPrincipal" id="1">
        <frame name="frmHeader" width="100%" height="140p" bgcolor="#1565C0">
            <!-- Logo, título, botones de navegacion -->
        </frame>
        <frame name="frmBody" width="100%" height="-2" scroll="true" bgcolor="#FFFFFF">
            <!-- Contenido: campos, listas, botones -->
        </frame>
        <frame name="frmFooter" width="100%" height="100p" bgcolor="#F5F5F5">
            <!-- Botones de acción, barra inferior -->
        </frame>
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

## Plantilla Estándar de Coleccion de Datos


```xml
<?xml version="1.0" encoding="iso-8859-15"?>
<coll name="MiColeccion"
      progid="ASData.CASBasicDataObj"
      sql="SELECT ID, NOMBRE FROM ##PREF##MiColeccion"
      objname="MiColeccion"
      updateobj="MiColeccion"
      loadall="true">
    <group name="General" id="1">
        <!-- ID y ROWID los gestiona XOne: no hace falta declararlos (válido pero redundante). Solo ID se rescata en el SELECT. -->
        <prop name="NOMBRE" type="T" visible="7" size="150" width="100%" />
    </group>
</coll>
```

## Plantilla mappings.xne


```xml
<?xml version="1.0" encoding="iso-8859-15"?>
<xml>
    <app prefix="gen" version="1.0.0" debug="true" default-language="javascript">
        <style url="default.css" />
    </app>
    <collprops type="general">
        <coll name="Empresas"
              progid="ASGestion.CASEmpresa"
              sql="SELECT ID, CODIGO, NOMBRE FROM ##PREF##Empresas"
              objname="Empresas" updateobj="Empresas" loadall="true">
            <group name="General" id="1">
                <prop name="CODIGO" type="N" visible="7" />
                <prop name="NOMBRE" type="T" visible="7" size="150" width="100%" />
            </group>
        </coll>
        <coll name="Usuarios"
              progid="ASGestion.CASUser"
              sql="SELECT ID, CODIGO, NOMBRE, IDEMPRESA, LOGIN, PWD FROM ##PREF##Usuarios"
              objname="Usuarios" updateobj="Usuarios" loadall="true">
            <group name="General" id="1">
                <prop name="CODIGO"     type="N" visible="7" />
                <prop name="NOMBRE"     type="T" visible="7" size="100" width="100%" />
                <prop name="IDEMPRESA"  type="N" visible="7" mapcol="Empresas" mapfld="ID" />
                <prop name="LOGIN"      type="T" visible="7" size="50"  width="100%" />
                <prop name="PWD"        type="X" visible="0" size="100" />
            </group>
        </coll>
    </collprops>
</xml>
```

---
