# XOne XML — mappings.xne y colecciones en archivos separados

> Fuente: `xone/v2/xone-project-generator/references/xone-xml-ui-d-patrones-mappings.md` §12–§13. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §12 estructura obligatoria de mappings.xne (Empresas y Usuarios) · §13 colecciones adicionales en archivos separados

---

## 12. mappings.xne - Estructura Obligatoria

### Regla Fundamental

> **IMPORTANTE:** El archivo `mappings.xne` SOLO debe contener las colecciones base **Empresas** y **Usuarios**. Todas las demas colecciones deben definirse en archivos `.xne` separados.

### Campos Mínimos Obligatorios

| Coleccion | Campos Obligatorios |
|-----------|---------------------|
| **Empresas** | `CODIGO` (N), `NOMBRE` (T) |
| **Usuarios** | `CODIGO` (N), `NOMBRE` (T), `IDEMPRESA` (N, mapcol="Empresas"), `LOGIN` (T), `PWD` (X) |

> No hace falta declarar `ID` ni `ROWID` como `<prop>`: son columnas de plataforma que XOne gestiona automáticamente (el `ROWID` es el GUID de 32 hex de sincronización que el framework autogenera). Declararlas es válido pero redundante. El campo de empresa en Usuarios es `IDEMPRESA` (sin guion bajo).

### Plantilla Completa

```xml
<?xml version="1.0" encoding="iso-8859-15"?>
<xml>
    <app prefix="gen" version="1.0.0" debug="true"
        default-language="javascript">
        <style url="default.css" />
    </app>

    <coll name="Empresas"
          sql="SELECT t1.* FROM ##PREF##empresa t1"
          objname="empresa" updateobj="empresa"
          progid="ASGestion.CASEmpresa"
          loadall="true">
        <group name="General" id="1">
            <prop name="CODIGO" type="N" visible="7" />
            <prop name="NOMBRE" type="T" visible="7" fieldsize="150" />
        </group>
    </coll>

    <coll name="Usuarios"
          sql="SELECT t1.* FROM ##PREF##usuario t1"
          objname="usuario" updateobj="usuario"
          progid="ASGestion.CASUser"
          loadall="true">
        <group name="General" id="1">
            <prop name="CODIGO" type="N" visible="7" />
            <prop name="NOMBRE" type="T" visible="7" fieldsize="100" />
            <prop name="IDEMPRESA" type="N" visible="7"
                mapcol="Empresas" mapfld="ID" />
            <prop name="LOGIN" type="T" visible="7" fieldsize="50" />
            <prop name="PWD" type="X" visible="0" fieldsize="100" />
        </group>
        <create>
            <action name="setval" field="IDEMPRESA"
                value="##ENTID##" />
        </create>
    </coll>
</xml>
```

> **CRITICO:** El nodo raiz es `<xml>` y las colecciones van **directamente dentro de `<xml>`**, sin ningún nodo contenedor intermedio como `<collprops>`. El encoding puede ser UTF-8 o `iso-8859-15` (coherente con los bytes del fichero). El campo de empresa en Usuarios se llama `IDEMPRESA` (sin guion bajo). En `mappings.xne`, Empresas usa `progid="ASGestion.CASEmpresa"` y Usuarios `progid="ASGestion.CASUser"`.

### Convencion de Nombres en BD

Con `prefix="gen"`:
- Tabla Empresas: `gen_empresa`, Tabla Usuarios: `gen_usuario`
- Campos siempre en MAYUSCULAS: `NOMBRE`, `CODIGO`, `IDEMPRESA`

---

## 13. Colecciones Adicionales - Archivos Separados

### Regla

Cada coleccion que NO sea Empresas o Usuarios se define en su propio archivo `.xne`.

### Plantilla

```xml
<?xml version="1.0" encoding="iso-8859-15"?>
<coll name="[NombreColeccion]"
      sql="SELECT t1.* FROM ##PREF##[NombreColeccion] t1"
      objname="[NombreColeccion]"
      updateobj="[NombreColeccion]"
      progid="ASData.CASBasicDataObj"
      loadall="true">
    <group name="General" id="1">
        <!-- Campos de la coleccion -->
    </group>
</coll>
```

### Ejemplo: Productos.xne

```xml
<?xml version="1.0" encoding="iso-8859-15"?>
<coll name="Productos"
      sql="SELECT t1.* FROM ##PREF##Productos t1"
      objname="Productos" updateobj="Productos"
      progid="ASData.CASBasicDataObj"
      loadall="true">
    <group name="General" id="1">
        <prop name="CODIGO" type="T" visible="7" fieldsize="20" />
        <prop name="NOMBRE" type="T" visible="7" fieldsize="150" />
        <prop name="DESCRIPCION" type="T" visible="7" fieldsize="500" />
        <prop name="PRECIO" type="N2" visible="7" />
        <prop name="STOCK" type="N" visible="7" />
        <prop name="ACTIVO" type="NC" visible="7" />
    </group>
</coll>
```

### Ejemplo: Pedidos.xne

```xml
<?xml version="1.0" encoding="iso-8859-15"?>
<coll name="Pedidos"
      sql="SELECT t1.* FROM ##PREF##Pedidos t1"
      objname="Pedidos" updateobj="Pedidos"
      progid="ASData.CASBasicDataObj"
      loadall="true">
    <group name="General" id="1">
        <prop name="IDUSUARIO" type="N" visible="7"
            mapcol="Usuarios" mapfld="ID" />
        <prop name="FECHA" type="DT" visible="7" />
        <prop name="ESTADO" type="T" visible="7" fieldsize="20" />
        <prop name="TOTAL" type="N2" visible="7" />
    </group>
</coll>
```

### Estructura Correcta vs Incorrecta

```
INCORRECTO:
mappings.xne contiene: Empresas, Usuarios, Productos, Pedidos

CORRECTO:
mappings.xne    -> Solo Empresas y Usuarios
Productos.xne   -> Coleccion Productos
Pedidos.xne     -> Coleccion Pedidos
```

