# Generación XOne — Fases 0-2: flujo, requisitos y modelo de datos

> Fuente: `xone/v2/xone-project-generator/references/xone-project-generation-workflow.md` §1–§3. Referencia de la skill; el índice está en [../SKILL.md](../SKILL.md).

Contenido: §1 Fase 0 diagrama de flujo completo · §2 Fase 1 análisis de requisitos (datos mínimos, inferencias, regla de decisión técnica) · §3 Fase 2 diseño del modelo de datos (colecciones base obligatorias, tipos de propiedades, visibilidad, foreign keys)

---

## 1. Fase 0: Diagrama de Flujo Completo

```
INICIO: Usuario solicita nuevo proyecto
         |
         v
[FASE 0] Diagrama / Planificacion
         |
         v
[FASE 1] Analisis de Requisitos
         |-- Identificar sector y funcionalidades
         |-- Determinar colecciones necesarias
         |-- Identificar pantallas requeridas
         |-- Definir paleta de colores e iconos
         |
         v
[FASE 2] Diseno del Modelo de Datos
         |-- Colecciones base (Empresas, Usuarios)
         |-- Colecciones adicionales del proyecto
         |-- Relaciones entre colecciones
         |-- Tipos de campos y visibilidad
         |
         v
[FASE 3] Estilos CSS
         |-- default.css (estilos globales)
         |-- colors.css (paleta de colores, opcional)
         |
         v
[FASE 4] Creación de Estructura de Carpetas
         |-- bd/, icons/, files/, fonts/
         |
         v
[FASE 5] Generacion de Archivos de Configuración
         |-- app.xml (configuracion global)
         |-- app.ini (metadatos)
         |-- mappings.xne (SOLO Empresas y Usuarios)
         |
         v
[FASE 6] Generacion de Colecciones
         |-- Un archivo .xne por cada coleccion adicional
         |-- Definir campos, tipos, visibilidad
         |
         v
[FASE 7] Generacion de Pantallas
         |-- Decidir si la app tiene autologin o login
         |-- Login.xne (solo si NO es autologin)
         |-- EntradaApp.xne / MenuPrincipal.xne (punto de entrada)
         |-- Consola.xne (obligatoria, siempre; con replica completa o solo info de dispositivo)
         |-- Pantallas de listas, detalle, mapas, config
         |
         v
[FASE 8] Eventos y Reglas de Negocio
         |-- Eventos de ciclo de vida (create, insert, before-edit, after-edit, delete)
         |-- Eventos de coleccion Empresas (onlogon, onlogoff, maintenance, replica-ok...)
         |-- Eventos de contents (selecteditem, load, auto-selecteditem)
         |-- Eventos de controles (onclick, onchange, onback, onfocus...)
         |-- Eventos especiales de app (on-app-foreground, on-app-background, inactividad)
         |
         v
[FASE 9] Funciones JavaScript
         |-- functions.js (funciones globales)
         |-- Scripts adicionales si es necesario
         |
         v
[FASE 10] Generacion de READMEs
         |-- README.md en cada carpeta (bd/, icons/, files/, fonts/)
         |-- README.md principal con prompt detallado
         |
         v
[FASE 11] Tareas Finales (en este orden exacto)
         |-- 1. Generar base de datos con xone_db_generator
         |-- 2. Insertar datos iniciales (Empresa + Usuario admin)
         |-- 3. Descargar iconos (Iconify API — PNG, JPG o SVG validos)
         |
         v
[FASE 12] Validación
         |-- Ejecutar checklist completo
         |-- Verificar estructura, BD, iconos
         |
         v
FIN: Proyecto completo y validado
```

---

## 2. Fase 1: Análisis de Requisitos

### 2.1 Objetivo

Entender que hay que construir antes de escribir código. El agente debe inferir todo lo que pueda del contexto de la solicitud, y preguntar **únicamente lo que no pueda deducir por si mismo**.

> **REGLA:** No lanzar un interrogatorio. Analizar primero la solicitud, inferir, y preguntar solo lo mínimo imprescindible para no poder continuar.

---

### 2.2 Datos Mínimos Obligatorios

Son los únicos datos sin los cuales es imposible iniciar el proyecto. Si no están presentes en la solicitud, preguntar **en un único mensaje**, todos juntos:

| Dato | Por que es obligatorio |
|------|------------------------|
| **¿Que hace la app?** — descripción breve | Sin esto no se puede inferir nada: colecciones, pantallas, lógica |
| **¿Con login o sin login (autologin)?** | Determina si se genera Login.xne y como se configura app.xml |
| **¿Tiene replica con servidor?** | Determina el contenido de la Consola y la configuración de license.ini |

Si el programador ya lo ha descrito en su solicitud, no volver a preguntar.

---

### 2.3 Datos que el Agente Infiere

El agente deduce estos datos del contexto sin preguntar. Si la inferencia es dudosa, aplica el valor por defecto y avanza:

| Dato | Como inferirlo | Valor por defecto |
|------|----------------|-------------------|
| Nombre del proyecto | Del título o descripción de la solicitud | `MiProyecto` |
| Sector | De las entidades y funcionalidades descritas | `Servicios` |
| Colecciones necesarias | De las funcionalidades y entidades mencionadas | Se modelan según el sector |
| Pantallas necesarias | De las colecciones y el flujo descrito | Lista + Detalle por cada coleccion |
| Pantalla de entrada | Si no se indica, usar `EntradaApp` | `EntradaApp` |
| Roles de usuario | De la descripción o del sector | `Administrador, Usuario` |
| Prefijo BD | Si no se indica explicitamente | `gen` |
| Plataforma | Si no se indica | Android |
| Orientación | Si no se indica | Portrait |
| Resolución de referencia | Si no se indica | 1080x1920 |
| Colores | Si no se indican, usar paleta Material Design neutra | `#2196F3`, `#757575`, `#FF5722` |
| Fuente | Si no se indica | `Roboto-Regular.ttf` |
| Integraciones (GPS, camara, PDF...) | De las funcionalidades descritas | Ninguna |
| Datos iniciales BD | Siempre | Empresa de prueba + usuario admin |

---

### 2.4 Datos que el Programador Puede Aportar Voluntariamente

El agente no pregunta por estos, pero si el programador los aporta, los usa:

- Diseños de pantallas (Figma, wireframes, imágenes)
- Colores corporativos o logo
- Fuente tipografica corporativa
- Campos especificos de las entidades
- Restricciones técnicas (versión Android, seguridad, inactividad)
- URL del servidor de replica e intervalo de sincronización
- Prefijo de BD diferente a `gen`

---

### 2.5 Regla de Decisión Técnica

```
ANTES de escribir codigo:
1. ¿Existe documentacion en las knowledgebases?
   -> SI: Seguir la documentacion exactamente
   -> NO: Buscar ejemplos en templates/projects/

2. ¿Hay ejemplos similares en los proyectos?
   -> SI: Analizar el patron y adaptarlo
   -> NO: Preguntar al usuario antes de improvisar

3. ¿El atributo/funcion/propiedad esta documentado?
   -> SI: Usar solo valores documentados
   -> NO: NO inventar, buscar alternativas documentadas
```

---

### 2.6 Donde Buscar Referencia

| Necesidad | Fuente |
|-----------|--------|
| Estructura de proyecto | `knowledgebase/docs/xone-project-structure-knowledgebase.md` |
| Atributos XML | `knowledgebase/docs/xone-xml-structure-knowledgebase.md` |
| API JavaScript | `knowledgebase/docs/xone-javascript-api-knowledgebase.md` |
| Estilos CSS | `knowledgebase/docs/xone-css-knowledgebase.md` |
| Guía paso a paso | `knowledgebase/docs/xone-new-project-guide-knowledgebase.md` |
| Proyecto de ejemplo | `knowledgebase/examples/UseCars/` |
| Proyectos reales | `templates/projects/` |


## 3. Fase 2: Diseño del Modelo de Datos

### 3.1 Objetivo

Disenar el modelo de datos completo del proyecto, incluyendo colecciones, campos, tipos, visibilidad y relaciones entre entidades.

### 3.2 Colecciones Base Obligatorias

Toda aplicación XOne debe tener al mínimo estas dos colecciones en `mappings.xne`.

**Estructura mínima obligatoria de `mappings.xne`:**

```xml
<?xml version="1.0" encoding="iso-8859-15"?>
<xml>
  <collprops type="general">

    <coll name="Empresas" title="la empresa"
          sql="select e.* from ##PREF##empresa e"
          objname="empresa" updateobj="empresa" progid="ASGestion.CASEmpresa">
      <group name="General" id="1">
        <prop name="CODIGO" visible="3" type="N" fieldsize="12" />
        <prop name="NOMBRE" type="T" fieldsize="30" size="250" />
      </group>
    </coll>

    <coll name="Usuarios" title="el usuario"
          sql="select u.* from ##PREF##usuarios u"
          objname="usuarios" updateobj="usuarios" progid="ASGestion.CASUser">
      <group name="General" id="1">
        <prop name="IDEMPRESA" visible="0" type="N" mapcol="Empresas" mapfld="ID" />
        <prop name="CODIGO" visible="3" type="T" fieldsize="10" size="50" />
        <prop name="LOGIN" visible="3" type="T" fieldsize="10" size="50" />
        <prop name="PWD" type="X" fieldsize="10" size="50" visible="0" />
        <prop name="NOMBRE" visible="3" type="T" fieldsize="30" size="50" />
      </group>
      <create>
        <action name="setval" field="IDEMPRESA" value="##ENTID##" />
      </create>
    </coll>

  </collprops>
</xml>
```

**Reglas críticas del mappings.xne:**
- Solo contiene `Empresas` y `Usuarios`. El resto de colecciones van en archivos `.xne` separados
- El campo de relación en Usuarios es `IDEMPRESA` (FK a Empresas), con `mapcol="Empresas" mapfld="ID"`
- El evento `<create>` en Usuarios asigna automáticamente `##ENTID##` al crear un nuevo usuario
- El encoding puede ser UTF-8 o `iso-8859-15` (coherente con los bytes; el motor respeta el declarado)

### 3.3 Tipos de Propiedades Disponibles

Los tipos de XOne se dividen en dos categorías: los que **se persisten en base de datos** y los que son **solo visuales** (no generan columna en BD).

#### Tipos de Datos (se persisten en BD)

| Tipo | SQLite | Descripción | Ejemplo de Uso |
|------|--------|-------------|----------------|
| `T` | TEXT | Texto. Admite variantes: texto simple, multilinea (con `lines`) o mapeada (con `linkedto`) | Nombres, descripciones, campos enlazados |
| `N` | INTEGER | Número entero | IDs, cantidades, flags numéricos |
| `N2` | REAL | Número con 2 decimales | Precios, importes |
| `N3` | REAL | Número con 3 decimales | Coordenadas |
| `N4` | REAL | Número con 4 decimales | Precisión alta |
| `N5` | REAL | Número con 5 decimales | Precisión muy alta |
| `N6` | REAL | Número con 6 decimales | GPS lat/lon |
| `TN` | TEXT | Número almacenado como texto (entero) | Números con leading zeros, códigos numéricos |
| `TN2` | TEXT | Número almacenado como texto (2 decimales) | Importes formateados como texto |
| `TN3` | TEXT | Número almacenado como texto (3 decimales) | Medidas con precisión |
| `TN4` | TEXT | Número almacenado como texto (4 decimales) | Precisión alta |
| `TN5` | TEXT | Número almacenado como texto (5 decimales) | Precisión muy alta |
| `TN6` | TEXT | Número almacenado como texto (6 decimales) | GPS como texto |
| `X` | TEXT | Password — se muestra enmascarado, admite `hash-type` y `encode` | Contrasenas |
| `D` | TEXT | Fecha | Fechas |
| `DT` | TEXT | Fecha y hora | Timestamps |
| `TT` | TEXT | Hora en formato texto | Horas, duraciones |
| `NC` | INTEGER | Checkbox / Toggle (0=no, 1=si) | Opciones booleanas |
| `IMG` | TEXT | Imagen (ruta al fichero) | Fotos referenciadas, logos |
| `PH` | TEXT | Fotografía — captura desde camara del dispositivo | Fotos tomadas en campo |
| `VD` | TEXT | Video — grabacion, selección o escaner QR/barcode | Grabacion de video, lectura de códigos |
| `AT` | TEXT | Adjunto — permite adjuntar ficheros al registro | Documentos adjuntos |
| `DR` | TEXT | Dibujo / firma a mano alzada (ruta al fichero) | Firmas, croquis |
| `WEB` | TEXT | WebView — URL o HTML embebido | Contenido web, videos online |
| `O` | (no aplica) | Sub-objeto JavaScript — NO genera columna ni se persiste | Estructuras temporales en memoria |

#### Tipos de UI (NO se persisten en BD — solo visuales)

Estos tipos definen controles visuales que **no generan columna en la base de datos**. Se usan exclusivamente para la interfaz.

| Tipo | Descripción | Uso |
|------|-------------|-----|
| `L` | Etiqueta de texto (solo lectura) — forma preferida. Muestra el `title`; sin `title`, usa el valor del campo como fallback | Títulos, labels, textos informativos o valores dinámicos |
| `TL` | Alias legacy de `L` (mismo control) | Equivalente a `type="L"` |
| `THTML` | Etiqueta con contenido HTML enriquecido | Textos con formato HTML embebido (negrita, colores, enlaces) |
| `B` | Botón | Acciones, navegación, llamadas a ExecuteNode |
| `Z` | Contents — lista embebida dentro de otra coleccion | Subgrids, detalles de maestro-detalle, mapas (`viewmode="mapview"`), kanban, slider, etc. |

### 3.4 Sistema de Visibilidad (Bitmask)

El atributo `visible` define **en que contextos de la UI se pinta el campo**. Es estático — no se puede cambiar en tiempo de ejecución por script ni por condiciones. Si un campo tiene `visible="0"`, no existe en pantalla en ningun momento.

Cada bit representa un contexto:

| Bit | Valor | Contexto |
|-----|-------|----------|
| Bit 0 | 1 | Edición (formulario individual) |
| Bit 1 | 2 | Lista (vista de registros) |
| Bit 2 | 4 | Content (lista embebida `type="Z"`) |
| Bit 3 | 8 | Combo (desplegable) |

Cualquier combinacion de bits es valida. Las más usadas:

| Valor | Contextos | Uso típico |
|-------|-----------|------------|
| `0` | Ninguno | Campo puramente interno — solo para lógica |
| `1` | Edición | Solo en formulario individual |
| `2` | Lista | Solo en vista de registros |
| `3` | Edición + Lista | En formulario y en lista |
| `4` | Content | Solo en listas embebidas |
| `7` | Edición + Lista + Content | **El más habitual** |
| `8` | Combo | Solo en desplegables |
| `15` | Todos | Edición + Lista + Content + Combo |

**Regla general:**
- Campos de BD internos (ID, ROWID): `visible="0"`
- Campos visibles para el usuario: `visible="7"`
- Campos solo en formulario: `visible="1"`
- Campos solo en listas: `visible="2"`

> **Diferencia con `disablevisible`:** `visible` es estático — decide si el campo existe en pantalla en ese contexto. `disablevisible` es dinámico — el campo existe pero se muestra u oculta según el valor de otro campo en tiempo de ejecución.

### 3.5 Relaciones entre Colecciones (Foreign Keys)

Las relaciones se definen con los atributos `mapcol` y `mapfld`:

```xml
<!-- Campo que referencia otra coleccion -->
<prop name="IDEMPRESA" type="N" visible="7" mapcol="Empresas" mapfld="ID" />
<!-- Significa: IDEMPRESA referencia al campo ID de la coleccion Empresas -->
```

### 3.6 Ejemplo de Diseño de Modelo

Para una app de gestion de entregas:

```
Empresas (mappings.xne)
├── CODIGO, NOMBRE (declarar como <prop>; ID y ROWID los gestiona XOne, no hace falta declararlos)
├── CIF, DIRECCION, TELEFONO (adicionales)

Usuarios (mappings.xne)
├── CODIGO, NOMBRE, IDEMPRESA, LOGIN, PWD (declarar como <prop>; ID y ROWID los gestiona XOne)
├── ROL, EMAIL, TELEFONO, ACTIVO (adicionales)

Clientes (Clientes.xne)
├── ID, CODIGO, NOMBRE, DIRECCION, TELEFONO, EMAIL, LATITUD, LONGITUD

Pedidos (Pedidos.xne)
├── ID, ID_CLIENTE (FK->Clientes), FECHA, ESTADO, TOTAL, OBSERVACIONES

Entregas (Entregas.xne)
├── ID, ID_PEDIDO (FK->Pedidos), ID_REPARTIDOR (FK->Usuarios)
├── FECHA_ENTREGA, FIRMA, FOTO_ENTREGA, LATITUD, LONGITUD, ESTADO
```
