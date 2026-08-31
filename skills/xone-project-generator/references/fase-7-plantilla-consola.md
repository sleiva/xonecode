# Generación XOne — Fase 7: plantilla Consola.xne

> Fuente: `xone/v2/xone-project-generator/references/xone-project-generation-workflow.md` L2563–3032. Referencia de la skill; el índice está en [../SKILL.md](../SKILL.md).

Contenido: §7.7 plantilla Consola.xne completa (obligatoria)

---

### 7.7 Plantilla: Consola.xne (OBLIGATORIA)

La consola es una pantalla técnica presente en **todos** los proyectos XOne. No es pantalla principal — se accede desde un botón secundario, un menu de ajustes o similar. Su función es dar al soporte técnico (call center) toda la información necesaria para resolver los problemas del usuario.

**Una sola coleccion: `MenuConsolaReplica`**, con los grupos que correspondan según el proyecto:

| Grupo | Siempre / Solo con replica |
|-------|---------------------------|
| Drawer lateral (id=99) + Header fijo (id=98) | Siempre |
| **Grupo 1** — Datos del dispositivo | Siempre |
| **Grupo 2** — Logs de replica | Solo si hay replica |
| **Grupo 3** — Replica de ficheros (lista pendientes recibir/enviar) | Solo si hay replica |
| **Grupo 4** — Control de ficheros (botones fotos/envio) | Solo si hay replica |
| **Grupo 5** — Utilidades (envio de logs y BD al soporte) | Siempre |

> El Drawer lateral lista solo los grupos presentes. Si no hay replica, aparecen solo "Datos del dispositivo" y "Utilidades".

---

#### Plantilla completa: MenuConsolaReplica

```xml
<?xml version="1.0" encoding="iso-8859-15"?>
<xml>
<coll name="MenuConsolaReplica" title="Consola"
      sql="SELECT t1.* FROM ##PREF##empresa t1"
      objname="empresa" updateobj="empresa"
      progid="ASData.CASBasicDataObj"
      notab="true" group-swipe="true" special="false">

    <prop name="MAP_CAPTUREIMG" type="T" visible="0" />
    <prop name="MAP_OS"         type="T" visible="0" />
    <prop name="MAP_TAB"        type="T" visible="0" />
    <prop name="MAP_GROUP"       type="N" visible="0" />
    <prop name="MAP_TOTAL_PAGES" type="N" visible="0" />

    <!-- ================================================================ -->
    <!-- DRAWER lateral (menu de navegacion entre grupos)                 -->
    <!-- ================================================================ -->
    <group name="Drawer" id="99" drawer-orientation="left" width="65%" height="100%">
        <frame name="barraLateral" bgcolor="#FFFFFF" framebox="false"
               height="100%" align="top|left">
            <prop name="MAP_BT_OPCION1_DR" title="1- Datos del dispositivo"
                  type="B" visible="1" method="ExecuteNode(irGrupo(1))" />
            <!-- Solo si la app tiene replica: -->
            <prop name="MAP_BT_OPCION2_DR" title="2- Logs de replica"
                  type="B" visible="1" method="ExecuteNode(irGrupo(2))" />
            <prop name="MAP_BT_OPCION3_DR" title="3- Replica de ficheros"
                  type="B" visible="1" method="ExecuteNode(irGrupo(3))" />
            <prop name="MAP_BT_OPCION4_DR" title="4- Control de ficheros"
                  type="B" visible="1" method="ExecuteNode(irGrupo(4))" />
            <!-- Siempre: -->
            <prop name="MAP_BT_OPCION5_DR" title="5- Utilidades"
                  type="B" visible="1" method="ExecuteNode(irGrupo(5))" />
        </frame>
    </group>

    <!-- ================================================================ -->
    <!-- HEADER fijo                                                       -->
    <!-- ================================================================ -->
    <group name="Menu" id="98" fixed="true" orientation="top" height="10%">
        <frame name="frmHeader" bgcolor="#93B359" align="left|center"
               width="100%" height="100%">
            <prop name="MAP_BTN_DRAWER" type="B" img="icon_drawer.png"
                  labelwidth="0" title=" " onclick="ui.toggleGroup('99');" />
            <prop name="MAP_BTN_ATRAS" type="B" img="atras.png"
                  labelwidth="0" title=" " method="ExecuteNode(onback)" newline="false" />
            <prop name="MAP_TAB" type="T" visible="1" width="60%" newline="false" />
        </frame>
    </group>

    <!-- ================================================================ -->
    <!-- GRUPO 1: Datos del dispositivo (SIEMPRE)                         -->
    <!-- ================================================================ -->
    <group name="Device" id="1" bgcolor="#E7E7E7" onfocus="ExecuteNode(irGrupo(1))">
        <frame name="frmDevice" width="100%" height="100%" scroll="true">
            <prop name="MAP_VERSIONAPP"         type="T" visible="1" title="Versión aplicación:" locked="true" />
            <prop name="MAP_VERSIONFRAME"       type="T" visible="1" title="Versión framework:"  locked="true" />
            <prop name="MAP_VERSIONCODE"        type="T" visible="1" title="Versión code:"       locked="true" />
            <prop name="MAP_MID"                type="T" visible="1" title="MID dispositivo:"    locked="true" />
            <prop name="MAP_IMEI"               type="T" visible="1" title="IMEI:"               locked="true" />
            <prop name="MAP_DISPOSITIVO"        type="T" visible="1" title="Modelo:"             locked="true" />
            <prop name="MAP_FABRICANTE"         type="T" visible="1" title="Fabricante:"         locked="true" />
            <prop name="MAP_DEVICE_TYPE"        type="T" visible="1" title="Tipo dispositivo:"   locked="true" />
            <prop name="MAP_OS"                 type="T" visible="1" title="Sistema operativo:"  locked="true" />
            <prop name="MAP_OS_VERSION"         type="T" visible="1" title="Versión SO:"         locked="true" />
            <prop name="MAP_ORIENTATION_SCREEN" type="T" visible="1" title="Orientación:"        locked="true" />
            <prop name="MAP_DENSITY"            type="T" visible="1" title="Tipo densidad:"      locked="true" />
            <prop name="MAP_DENSITY2"           type="T" visible="1" title="Densidad:"           locked="true" />
            <prop name="MAP_RESOLUTIONWIDTH"    type="T" visible="1" title="Resol. ancho:"       locked="true" />
            <prop name="MAP_RESOLUTIONHEIGHT"   type="T" visible="1" title="Resol. alto:"        locked="true" />
        </frame>
    </group>

    <!-- ================================================================ -->
    <!-- GRUPO 2: Logs de replica + cola de operaciones (SOLO REPLICA)    -->
    <!-- ================================================================ -->
    <group name="ReplicaDatos" id="2" bgcolor="#E7E7E7" onfocus="ExecuteNode(irGrupo(2))">
        <frame name="frmReplicaDatos" width="100%" height="450p" scroll="true">
            <prop name="MAP_CMDDATE"     type="T" visible="1" title="Fecha ultima conexión:"  locked="true" />
            <prop name="MAP_RECORDSRX"   type="T" visible="1" title="Operaciones recibidas:"  locked="true" />
            <prop name="MAP_RECORDSTX"   type="T" visible="1" title="Operaciones enviadas:"   locked="true" />
            <prop name="MAP_RECORDSPEND" type="T" visible="1" title="Operaciones pendientes:" locked="true" />
            <frame name="frmLog" width="98%" height="50%" lmargin="1%"
                   framebox="true" border-corner-radius="10" scroll="true">
                <prop name="MAP_LOG" type="T" visible="1" labelwidth="0"
                      locked="true" lines="5" text-border="false" />
            </frame>
        </frame>
        <!-- Cola de operaciones pendientes de replica -->
        <frame name="frmOperQueue" width="100%" height="650p">
            <prop name="MAP_TITLECOLA" type="L" title="Cola de operaciones pendientes:" />
            <prop name="@OperQueue" type="Z" visible="1" locked="true"
                  contents="OperQueue" width="96%" lmargin="2%" />
            <contents name="OperQueue" src="ContentOperQueue" />
        </frame>
        <frame name="frmBottomReplica" width="100%" height="13%" align="center|center">
            <prop name="MAP_BT_REPLICAR"  type="B" title="Replicar"
                  method="ExecuteNode(replicar)" width="40%" height="50%" />
            <prop name="MAP_BT_COMPARTIR" type="B" title="Compartir"
                  method="ExecuteNode(compartir)"
                  width="40%" height="50%" newline="false" lmargin="5%" />
        </frame>
    </group>

    <!-- ================================================================ -->
    <!-- GRUPO 3: Lista de ficheros pendientes (SOLO REPLICA)             -->
    <!-- ================================================================ -->
    <group name="ReplicaFicheros" id="3" bgcolor="#E7E7E7" onfocus="ExecuteNode(irGrupo(3))">
        <frame name="frmReplicaFicheros" height="87%">
            <prop name="MAP_TITLETOTAL" type="L" title="Ficheros pendientes recibir:"
                  visible="1" width="40%" />
            <prop name="MAP_TOTAL" type="N" visible="1" newline="false"
                  width="50%" locked="true" />
            <frame name="frmListaRecibir" width="100%" height="40%" scroll="true">
                <prop name="replicafile" type="Z" visible="1" contents="replicafile"
                      width="100%" height="100%" locked="true"
                      disablevisible="MAP_OS='ios'" />
                <contents name="replicafile" src="ContentReplicaFiles"
                          filter="STATUS!=201 AND REPLICATYPE=0" />
            </frame>
            <prop name="MAP_TITLETOTAL_ENV" type="L" title="Ficheros pendientes enviar:"
                  visible="1" width="40%" />
            <prop name="MAP_TOTAL_ENV" type="N" visible="1" newline="false"
                  width="50%" locked="true" />
            <frame name="frmListaEnviar" width="100%" height="40%" scroll="true">
                <prop name="replicafile_ENV" type="Z" visible="1" contents="replicafile_ENV"
                      width="100%" height="100%" locked="true"
                      disablevisible="MAP_OS='ios'" />
                <contents name="replicafile_ENV" src="ContentReplicaFiles"
                          filter="STATUS!=201 AND REPLICATYPE=1" />
            </frame>
        </frame>
        <frame name="frmBottomFicheros" width="100%" height="13%" align="center|center">
            <prop name="MAP_BT_REPLICAR2"  type="B" title="Replicar"
                  method="ExecuteNode(replicar)" width="40%" height="50%" />
            <prop name="MAP_BT_COMPARTIR2" type="B" title="Compartir"
                  method="ExecuteNode(compartir)"
                  width="40%" height="50%" newline="false" lmargin="5%" />
        </frame>
    </group>

    <!-- ================================================================ -->
    <!-- GRUPO 4: Control de ficheros con botones (SOLO REPLICA)          -->
    <!-- ================================================================ -->
    <group name="ControlFicheros" id="4" bgcolor="#E7E7E7" onfocus="ExecuteNode(irGrupo(4))">
        <frame name="frmCenter" width="100%" height="100%" align="top|center">
            <prop type="B" name="Ok99" img="hacer_foto.png"
                  title="HACER FOTO"
                  align="center" width="550p" height="150p" visible="1"
                  method="ExecuteNode(camera)" label-wrap="true" />
            <prop type="B" name="Ok3" img="archivos_nocomienza.png"
                  title="FOTOS SIN ENVIO INICIADO"
                  align="center" width="550p" height="150p" visible="1"
                  method="ExecuteNode(verFicheros(nocomienza))" label-wrap="true" />
            <prop type="B" name="Ok4" img="archivos_enproceso.png"
                  title="FOTOS EN PROCESO DE ENVIO"
                  align="center" width="550p" height="150p" visible="1"
                  method="ExecuteNode(verFicheros(enproceso))" label-wrap="true" />
            <prop type="B" name="Ok10" img="archivos_enviados.png"
                  title="FOTOS ENVIADAS A LA CENTRAL"
                  align="center" width="550p" height="150p" visible="1"
                  method="ExecuteNode(verFicheros(enviados))" label-wrap="true" />
            <prop type="B" name="Ok2" img="iniciar_replica.png"
                  title="INICIAR ENVIO DE FICHEROS"
                  align="center" width="550p" height="150p" visible="1"
                  method="ExecuteNode(replicar)" label-wrap="true" />
        </frame>
    </group>

    <!-- ================================================================ -->
    <!-- GRUPO 5: Utilidades - envio de diagnostico (SIEMPRE)             -->
    <!-- ================================================================ -->
    <group name="Utilidades" id="5" bgcolor="#E7E7E7" onfocus="ExecuteNode(irGrupo(5))">
        <frame name="frmUtilidades" align="top|center" height="100%">
            <!-- Enviar log Android (oculto en iOS) -->
            <prop name="MAP_BT_ENVIAR_LOG" type="B" visible="1"
                  title="Enviar log" width="90%" height="10%"
                  onclick="javascript:doDebugTools(0);"
                  disablevisible="MAP_OS='IOS' OR MAP_OS='ios'" />
            <!-- Enviar base de datos -->
            <prop name="MAP_BT_ENVIAR_BD" type="B" visible="1"
                  title="Enviar base de datos" width="90%" height="10%"
                  onclick="javascript:doDebugTools(1);" />
            <!-- Enviar BD debug replica (solo Android) -->
            <prop name="MAP_BT_ENVIAR_BD_REP" type="B" visible="1"
                  title="Enviar BD depuracion replica" width="90%" height="10%"
                  onclick="javascript:doDebugTools(2);"
                  disablevisible="MAP_OS='IOS' OR MAP_OS='ios'" />
            <!-- Enviar BD debug ficheros (solo Android) -->
            <prop name="MAP_BT_ENVIAR_BD_FIC" type="B" visible="1"
                  title="Enviar BD depuracion ficheros" width="90%" height="10%"
                  onclick="javascript:doDebugTools(3);"
                  disablevisible="MAP_OS='IOS' OR MAP_OS='ios'" />
        </frame>
    </group>

    <!-- ================================================================ -->
    <!-- before-edit: cargar macros del dispositivo e inicializar datos   -->
    <!-- ================================================================ -->
    <before-edit>
        <action name="setval" field="MAP_VERSIONAPP"          value="##VERSION##" />
        <action name="setval" field="MAP_VERSIONFRAME"        value="##FRAME_VERSION##" />
        <action name="setval" field="MAP_VERSIONCODE"         value="##FRAME_VERSION_CODE##" />
        <action name="setval" field="MAP_DISPOSITIVO"         value="##DEVICE_MODEL##" />
        <action name="setval" field="MAP_FABRICANTE"          value="##DEVICE_MANUFACTURER##" />
        <action name="setval" field="MAP_DEVICE_TYPE"         value="##DEVICE_TYPE##" />
        <action name="setval" field="MAP_IMEI"                value="##DEVICEID##" />
        <action name="setval" field="MAP_MID"                 value="##MID##" />
        <action name="setval" field="MAP_ORIENTATION_SCREEN"  value="##CURRENT_ORIENTATION##" />
        <action name="setval" field="MAP_OS"                  value="##DEVICE_OS##" />
        <action name="setval" field="MAP_OS_VERSION"          value="##DEVICE_OSVERSION##" />
        <action name="setval" field="MAP_DENSITY"             value="##CURRENT_DENSITY##" />
        <action name="setval" field="MAP_DENSITY2"            value="##CURRENT_DENSITY_VALUE##" />
        <action name="setval" field="MAP_RESOLUTIONWIDTH"     value="##SCREEN_RESOLUTION_WIDTH##" />
        <action name="setval" field="MAP_RESOLUTIONHEIGHT"    value="##SCREEN_RESOLUTION_HEIGHT##" />
        <action name="runscript">
            <script language="javascript">
                // Activar flag de consola abierta (para el auto-refresh)
                appData.getCurrentEnterprise().setVariable("ConsolaReplica", 1);

                if (self.MAP_VERSIONCODE === "##FRAME_VERSION_CODE##") {
                    self.MAP_VERSIONCODE = "No disponible";
                }

                // Cargar datos de replica y ficheros
                inicializarDatosReplica(self);
                inicializarDatosReplicaFicheros(self);

                // Iniciar auto-refresh cada 5 segundos
                ui.executeActionAfterDelay("refreshDatosReplica", 1);
            </script>
        </action>
    </before-edit>

    <!-- Navegar entre grupos y actualizar título del header -->
    <irGrupo refresh="false" show-wait-dialog="false">
        <action name="runscript">
            <param name="parametro" />
            <script language="javascript">
                irGrupoConsolaReplica(parametro, self);
            </script>
        </action>
    </irGrupo>

    <!-- Lanzar replica manual -->
    <replicar refresh="false" show-wait-dialog="false">
        <action name="runscript">
            <script language="javascript">
                replica.start();
                ui.showToast("Iniciando ciclo de replica");
            </script>
        </action>
    </replicar>

    <!-- Auto-refresh mientras la consola esta abierta -->
    <refreshDatosReplica refresh="false" show-wait-dialog="false">
        <action name="runscript">
            <script language="javascript">
                if (appData.getCurrentEnterprise().getVariable("ConsolaReplica") == 1) {
                    inicializarDatosReplica(self);
                    inicializarDatosReplicaFicheros(self);
                    ui.getView(self).refresh(
                        "MAP_RECORDSRX", "MAP_RECORDSTX", "MAP_RECORDSPEND",
                        "MAP_LOG", "MAP_CMDDATE",
                        "MAP_TOTAL", "MAP_TOTAL_ENV",
                        "replicafile", "replicafile_ENV"
                    );
                    ui.executeActionAfterDelay("refreshDatosReplica", 5);
                }
            </script>
        </action>
    </refreshDatosReplica>

    <!-- Capturar pantalla y compartir -->
    <compartir show-wait-dialog="false">
        <action name="runscript">
            <script language="javascript">
                try {
                    ui.captureImage("MAP_CAPTUREIMG");
                    ui.shareData("Compartir byXOne", "", self.MAP_CAPTUREIMG);
                } catch(ex) {}
            </script>
        </action>
    </compartir>

    <!-- Onback: desactivar flag y salir -->
    <onback show-wait-dialog="false">
        <action name="runscript">
            <script language="javascript">
                appData.getCurrentEnterprise().setVariable("ConsolaReplica", 0);
                exitCollection();
            </script>
        </action>
    </onback>

</coll>
</xml>
```

---

#### Coleccion ContentOperQueue — Cola de Operaciones Pendientes

Muestra las operaciones INSERT/UPDATE/DELETE pendientes en `master_replica_queue`. Se usa como contents en el Grupo 2.

```xml
<coll name="ContentOperQueue" title="OperQueue"
      sql="SELECT
           CASE WHEN t1.OPER=1 THEN 'INSERT'
                WHEN t1.OPER=2 THEN 'DELETE'
                WHEN t1.OPER=3 THEN 'UPDATE'
           END AS MAP_OPER,
           t1.SQL AS MAP_SQL
           FROM master_replica_queue t1"
      userawsql="true"
      objname="empresa" updateobj="empresa"
      progid="ASData.CASBasicDataObj"
      cell-odd-color="#FFFFFF" cell-even-color="#F2F2F2">
    <group name="General" id="1">
        <prop name="MAP_OPER" class="classgrid" width="30%" />
        <prop name="MAP_SQL"  class="classgrid" newline="false" width="68%" />
    </group>
</coll>
```

#### Coleccion ContentReplicaFiles — Ficheros con barra de progreso

Muestra los ficheros en proceso de envio con barra de progreso visual usando `##FLD_MAP_CALCULOBLOCK##` como ancho dinámico.

```xml
<coll name="ContentReplicaFiles" fontsize="8" title="ReplicaFiles"
      show-toolbar="false" notab="true"
      objname="master_replica_files" updateobj="master_replica_files"
      progid="ASData.CASBasicDataObj"
      sql="SELECT * FROM master_replica_files"
      connection="Info_ReplicaFiles"
      loadall="false" editmask="8"
      check-owner="false" dependent="false">
    <group name="General" id="1">
        <frame name="page_contact" width="100%" height="100%" bgcolor="#FFFFFF">
            <prop name="LICENSE"          type="T" visible="7" locked="true" labelwidth="0" title="Licencia:" />
            <prop name="FILENAME"         type="T" visible="7" locked="true" labelwidth="0" title="Nombre:" />
            <prop name="STATUS"           type="N" visible="7" locked="true" labelwidth="0" title="Status:" align="center" />
            <prop name="MAP_CALCULOBLOCK" type="N" visible="7" locked="true" labelwidth="0" title="Porciento:" align="center" newline="false" />
            <prop name="BLOCK"            type="N" visible="7" locked="true" labelwidth="0" title="B.Tras:" align="center" newline="false" />
            <prop name="BLOCKS"           type="N" visible="7" locked="true" labelwidth="0" title="Total:" align="center" newline="false" />
            <!-- Barra de progreso: ancho dinámico según porcentaje -->
            <frame name="progress_frame" width="100" height="30"
                   framebox="true" bgcolor="#505050" align="left|center">
                <frame name="progress_bar" width="##FLD_MAP_CALCULOBLOCK##" height="28"
                       framebox="true" bgcolor="#FF0000" align="left|center">
                    <prop name="MAP_TL" type="L" visible="0" labelwidth="1" locked="true" title="" />
                </frame>
            </frame>
        </frame>
    </group>
</coll>
```


> **NOTA:** `master_replica_files` y `master_replica_queue` son tablas internas del sistema XOne. No requieren definición en el modelo de datos del proyecto.

---

#### Funciones JavaScript requeridas en functions.js

```javascript
// Envia información de diagnostico al servidor de soporte
// método: 0=log Android, 1=BD, 2=BD replica debug, 3=BD ficheros debug
function doDebugTools(metodo) {
    var urlLog = "https://xoneisp.com/XoneLogRec/reclog.aspx";
    var debugTools = new DebugTools();
    if (typeof debugTools === "undefined") {
        ui.showToast("Funcion no implementada en IOS");
        return;
    }
    var message, result;
    switch (metodo) {
        case 0: message = "el log de android";
                result = debugTools.sendLog(urlLog); break;
        case 1: message = "la base de datos";
                result = debugTools.sendDatabase(urlLog); break;
        case 2: message = "la base de datos de depuracion";
                result = debugTools.sendReplicaDebugDatabase(urlLog); break;
        case 3: message = "la base de datos de depuracion de ficheros";
                result = debugTools.sendReplicaFilesDatabase(urlLog); break;
    }
    ui.showToast(result === -1 ? "No se pudo enviar " + message : "Enviado correctamente.");
    debugTools = null;
}

// Navega entre grupos de la consola y actualiza el título del header
function irGrupoConsolaReplica(parametro, objself) {
    try {
        switch (parametro) {
            case '1': objself.MAP_TAB = "Datos del dispositivo 1/5"; break;
            case '2': objself.MAP_TAB = "Logs de replica 2/5";       break;
            case '3': objself.MAP_TAB = "Replica de ficheros 3/5";   break;
            case '4': objself.MAP_TAB = "Control de ficheros 4/5";   break;
            case '5': objself.MAP_TAB = "Utilidades 5/5";            break;
        }
        ui.hideGroup('99');
        ui.showGroup(parametro);
        ui.getView(objself).refresh("MAP_TAB");
    } catch(e) {
        writelogExceptionJSv2("irGrupoConsolaReplica ERROR: " + e.message, "functions.js", false);
    }
}

// Carga los datos de replica en los campos MAP_ de la consola
function inicializarDatosReplica(coll) {
    if (appData.getGlobalMacro("##DEVICE_OS##") === "android") {
        coll.MAP_RECORDSRX   = replica.getRecordsRX() + "/" + replica.getTotalRecordsRX();
        coll.MAP_RECORDSTX   = replica.getRecordsTX() + "/" + replica.getTotalRecordsTX();
        coll.MAP_RECORDSPEND = replica.getRecordsPend();
        coll.MAP_LOG         = replica.getLog();
        var replicaCMDLOG = appData.getCollection("ReplicaCmdLog");
        replicaCMDLOG.loadAll();
        coll.MAP_CMDDATE = replicaCMDLOG.getCount() > 0
            ? replicaCMDLOG.getItem(0).CMDTIME
            : "Nunca";
    }
}

// Carga los contadores de ficheros pendientes de replica
function inicializarDatosReplicaFicheros(objself) {
    if (appData.getGlobalMacro("##DEVICE_OS##") === "android") {
        var fc = objself.getContents("replicafile");
        fc.loadAll();
        objself.MAP_TOTAL = fc.getCount();

        var fe = objself.getContents("replicafile_ENV");
        fe.loadAll();
        objself.MAP_TOTAL_ENV = fe.getCount();

        ui.getView(objself).refresh(
            "MAP_TOTAL", "MAP_TOTAL_ENV", "replicafile", "replicafile_ENV"
        );
    }
}

// Arranca la replica y cierra la consola
function exitCollection() {
    replica.start();
    ui.getView(self).exit();
}
```

