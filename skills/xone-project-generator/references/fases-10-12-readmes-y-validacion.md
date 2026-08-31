# Generación XOne — Fases 10-12: READMEs, tareas finales y validación

> Fuente: `xone/v2/xone-project-generator/references/xone-project-generation-workflow.md` §11–§13. Referencia de la skill; el índice está en [../SKILL.md](../SKILL.md).

Contenido: §11 Fase 10 READMEs · §12 Fase 11 tareas finales (base de datos, datos iniciales, iconos) · §13 Fase 12 checklist completo de validación

---

## 11. Fase 10: Generación de READMEs

### 10.1 Objetivo

Crear un README.md en cada carpeta del proyecto y un README.md principal con el prompt detallado de generación.

### 10.2 READMEs por Carpeta

Cada carpeta obligatoria debe tener un README.md que describa:

- **bd/README.md**: Proposito de la carpeta, como se genera gestion.db, comando `xone_db_generator`
- **icons/README.md**: Fuente de iconos (Google Material Icons), formato PNG, tamanios estándar, nomenclatura
- **files/README.md**: Proposito (archivos dinámicos), como acceder desde código (appData.getFilesPath())
- **fonts/README.md**: Fuentes incluidas, formatos soportados (TTF, OTF), uso en CSS y XML

### 10.3 README.md Principal (Raiz del Proyecto)

El README.md principal debe ser un **prompt detallado** que describe completamente como crear la aplicación. Debe contener:

1. **Descripción General** - Que hace la app, sector, plataformas
2. **Funcionalidades** - Lista detallada de funciones principales
3. **Modelo de Datos** - Todas las colecciones con sus campos, tipos y relaciones
4. **Pantallas** - Descripción de cada pantalla con su proposito y elementos
5. **Flujos de Usuario** - Pasos de interaccion para cada funcionalidad
6. **Reglas de Negocio** - Validaciones, calculos y restricciones
7. **Integraciones** - GPS, camara, firma digital, NFC, Bluetooth, etc.
8. **Paleta de Colores** - Colores hex del proyecto (primario, secundario, acento, estados)
9. **Iconos Requeridos** - Lista completa de iconos necesarios con nombre y pantalla
10. **Comandos de Generación** - Como generar BD, descargar iconos, convertir e insertar datos

---

## 12. Fase 11: Tareas Finales

### 11.1 Objetivo

Ejecutar las tareas finales de generación en el orden exacto especificado. Estas tareas se ejecutan DESPUES de generar todo el código fuente.

### 11.2 Orden de Ejecución (OBLIGATORIO)

1. Generar base de datos (`xone_db_generator`)
2. Insertar datos iniciales (Empresa + Usuario admin)
3. Descargar iconos (Iconify API — PNG, JPG o SVG validos)

### 11.3 Tarea 1: Generar Base de Datos

Comando:

```bash
python3 -m xone_db_generator NombreProyecto --overwrite
```

Verificación: sqlite3 .../bd/gestion.db ".tables"

Las tablas deben tener el prefijo `gen_` y estar en minúsculas (ej: `gen_empresas`, `gen_usuarios`). Los campos se generan en mayúsculas.

**Mapeo de Tipos XOne a SQLite:**

| Tipo XOne | SQLite | Descripción |
|-----------|--------|-------------|
| T, L, TL, X, PH | TEXT | Texto |
| D, DT | TEXT | Fechas |
| IMG, VD, F, M | TEXT | Rutas |
| N | INTEGER | Entero |
| NC, R | INTEGER | Boolean |
| N1-N6 | REAL | Decimales |
| C | TEXT | Combo |
| B, Z, L, S, P, O | NO SE CREA | UI |

### 11.4 Tarea 2: Insertar Datos Iniciales

Registros obligatorios:
- Empresa: CODIGO=1, NOMBRE="EMPRESA DE PRUEBA", ROWID=GUID_32_hex
- Usuario: CODIGO=1, NOMBRE="admin", LOGIN="admin", IDEMPRESA=1, ROWID=GUID_32_hex

GUID sin guiones: python3 -c "import uuid; print(uuid.uuid4().hex)"

### 11.5 Tarea 3: Descargar Iconos

Fuente: Google Material Icons via Iconify API
URL: https://api.iconify.design/ic/baseline-{nombre}.svg?color={color}

XOne soporta PNG, JPG y SVG — no es necesario convertir SVG a PNG.
Iconos comunes: home, search, arrow-back, save, settings, person, add, delete, edit, check, close, menu

### 11.6 Nota sobre formatos de iconos

XOne soporta PNG, JPG y SVG directamente — no es necesario convertir ni eliminar los SVG.
Si por preferencia del proyecto se quiere usar solo PNG, se puede convertir con cairosvg (pip install cairosvg), pero no es obligatorio.

**Anti-patrón a evitar — NO renderices un SVG con `type="WEB"`:** el soporte de SVG en XOne es nativo y completo. Un `.svg` es una imagen más; se refiere con `type="IMG"` (`path="dibujo.svg"`) o con los atributos `img`/`imgbk`, igual que un PNG. El control `WEB` (WebView) es solo para contenido web remoto (URLs `http`/`https`, vídeos embebidos); usarlo para mostrar una imagen local SVG/PNG/JPG es innecesario y rompe el escalado y la integración con el control.

---

## 13. Fase 12: Validación

### 12.1 Objetivo

Ejecutar el checklist completo de validación para asegurar que el proyecto esta completo y funcional.

### 12.2 Checklist Completo

#### Archivos raiz
- [ ] app.xml existe con `prefix="gen"` (o el especificado por el usuario)
- [ ] app.xml tiene `<connection>`, `<entry-point>`, `<style>` e `<include>`
- [ ] app.xml declara un encoding coherente con sus bytes (UTF-8 o iso-8859-15)
- [ ] app.ini existe con `name`, `icon`, `IconFolder=icons`, `FilesFolder=files`
- [ ] license.ini existe con `Connstring=bd/gestion.db`
- [ ] mappings.xne existe SOLO con Empresas y Usuarios
- [ ] mappings.xne declara un encoding coherente con sus bytes (UTF-8 o iso-8859-15)
- [ ] mappings.xne tiene `progid="ASGestion.CASEmpresa"` en Empresas y `progid="ASGestion.CASUser"` en Usuarios
- [ ] Usuarios tiene evento `<create>` con `setval field="IDEMPRESA" value="##ENTID##"`

#### Campos obligatorios en mappings.xne
- [ ] Empresas tiene: `CODIGO` (N), `NOMBRE` (T)
- [ ] Usuarios tiene: `IDEMPRESA` (N, FK a Empresas), `CODIGO` (T), `LOGIN` (T), `PWD` (X), `NOMBRE` (T)

#### Colecciones de negocio
- [ ] Cada coleccion adicional tiene su propio archivo `.xne` (NINGUNA en mappings.xne)
- [ ] Cada coleccion tiene `sql` con `##PREF##` y el campo `ID` en el SELECT
- [ ] Cada coleccion tiene `objname`, `updateobj` y `progid="ASData.CASBasicDataObj"`
- [ ] Tipos de campos validos: `T`, `N`, `N1`-`N6`, `X`, `D`, `DT`, `NC`, `IMG`, `PH`, `VD`, `AT`, `DR`, `TT` para datos; `L` (o su alias legacy `TL`), `THTML`, `B`, `Z` solo para UI
- [ ] Valores de `visible` usan bitmask correcto (0-7)
- [ ] Campos enlazados de JOINs llevan prefijo `MAP_` y están marcados como `locked="true"`
- [ ] Campos FK se nombran `IDLOQUESEA` (todo junto en mayusculas) y usan `mapcol`/`mapfld`
- [ ] Campos tipo Z llevan prefijo `@` en el name y tienen su `<contents>` asociado
- [ ] Filtros van en `filter`, ordenaciones en `sort` — NUNCA en el `sql`
- [ ] No se usan `px` en dimensiones — solo `p` o `%`

#### Pantallas
- [ ] Existe punto de entrada (`EntradaApp.xne` o `MenuPrincipal.xne`) declarado en `<entry-point>` del app.xml
- [ ] Si `autologon="false"`: existe `Login.xne` declarado en `<login-coll>` del app.xml
- [ ] Existe `Consola.xne` (siempre obligatoria)
- [ ] Pantallas con replica: Consola tiene todos los grupos (info replica, dispositivo, ficheros)
- [ ] Pantallas sin replica: Consola tiene solo el grupo de información del dispositivo
- [ ] Todas las colecciones-pantalla tienen `<onback>` definido
- [ ] Grupos fijos (header/footer) usan `fixed="true"` con `orientation="top|bottom"`
- [ ] Events usan sintaxis correcta: `<action name="runscript"><script language="javascript">`

#### Estilos CSS
- [ ] `default.css` existe en la raiz del proyecto
- [ ] No hay `compatibility-mode="true"` en app.xml (anularia los CSS)
- [ ] Unidades en `p` o `%` (NUNCA `px`, `em`, `rem`)
- [ ] `resolution-width` y `resolution-height` coinciden con el dispositivo físico de referencia
- [ ] Tamaños de UI usando los valores estándar documentados (TopBar=164p, Botón=124p, Campo=144p)
- [ ] Fuentes definidas en CSS con clases `.fontN` o con `fontsize` directo en el prop
- [ ] Colores en formato `#RRGGBB` o `#AARRGGBB` (alpha primero)
- [ ] Selectores validos: `coll`, `group`, `frame`, `prop`, `prop:TIPO`, `.clase`
- [ ] `extends:.clase` referencia clases existentes

#### JavaScript
- [ ] `functions.js` existe con funciones globales
- [ ] Solo usa API documentada: `ui.*`, `appData.*`, `self.*`, `replica.*`
- [ ] NO usa APIs del DOM: `document`, `document.getElementById`, `document.querySelector`, `window`, `localStorage`, `sessionStorage`, `XMLHttpRequest`, `navigator`, `history` (sí están disponibles `fetch`, `Promise`, `setTimeout`, `URL` con implementación custom).
- [ ] NO usa `async`/`await` (parse error). Para asincronía prefiere callbacks idiomáticos XOne; `Promise` está disponible si el caso lo justifica.

#### Unicidad de nombres (restricción crítica — AMBITO: la coll ENTERA, no el group/frame)

> **PASO OBLIGATORIO antes de entregar cada `.xne`:** extraer con regex `name="([^"]+)"` todos los `name=` declarados en nodos `<group>`, `<frame>` y `<prop>` (NO contar `<field name>` de `<onchange>`, ni `name=` de la propia `<coll>`, ni el valor del atributo `fontname=`). Verificar que la lista resultante **no contiene duplicados**. Si hay alguno, renombrar — la solución canónica para campos BD que aparecen en listado + detalle con estilos distintos es declararlos UNA SOLA VEZ en el grupo detalle y añadir aliases `MAP_LIST_*` en el `sql=` para el listado (ver fila "Caso típico" de la tabla `Naming y unicidad` en SKILL.md).

- [ ] No hay dos `<coll>` con el mismo `name` en el proyecto
- [ ] No hay dos `<group>` con el mismo `name` dentro de la misma `<coll>`
- [ ] No hay dos `<group>` con el mismo `id` dentro de la misma `<coll>`
- [ ] No hay dos `<frame>` con el mismo `name` dentro de la misma `<coll>` (ámbito coll, NO group — un mismo nombre de frame en dos grupos distintos también colisiona)
- [ ] No hay dos `<prop>` con el mismo `name` dentro de la misma `<coll>` — incluido el caso típico: campo BD declarado en `grpLista` (visible="2") y otra vez en `grpDetalle` (visible="1") con clase distinta. Si necesitas estilos distintos por modo, declarar el real solo en detalle y usar alias `MAP_LIST_*` en el SELECT para el listado
- [ ] No hay dos eventos del mismo tipo (ej. dos `<before-edit>`) en la misma `<coll>`

#### Estructura de carpetas
- [ ] `bd/` existe con `README.md`
- [ ] `icons/` existe con `README.md`
- [ ] `files/` existe con `README.md`
- [ ] `fonts/` existe (recomendado)

#### Base de Datos
- [ ] `gestion.db` generado con `xone_db_generator`
- [ ] Tablas tienen prefijo `gen_` (o el especificado)
- [ ] Empresa inicial: `CODIGO=1`, `NOMBRE="EMPRESA DE PRUEBA"`
- [ ] Usuario admin: `CODIGO=1`, `LOGIN="admin"`, `IDEMPRESA=1`

#### Recursos gráficos
- [ ] Archivos de iconos en `icons/` en formato PNG, JPG o SVG
- [ ] Nomenclatura consistente: `ic_` (acciones), `app_` (icono app), `avatar_` (usuarios)

#### README
- [ ] `README.md` en la raiz con descripción del proyecto
- [ ] `README.md` en `bd/`, `icons/`, `files/`
