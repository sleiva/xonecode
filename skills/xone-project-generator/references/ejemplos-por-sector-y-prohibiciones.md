# Generación XOne — Ejemplos por sector y prohibiciones

> Fuente: `xone/v2/xone-project-generator/references/xone-project-generation-workflow.md` §14, §16. Referencia de la skill; el índice está en [../SKILL.md](../SKILL.md).

Contenido: §14 ejemplos por sector (logística, energía, comercio, salud, servicios) · §16 prohibiciones explícitas: lo que no se debe hacer nunca y la regla de oro

---

## 14. Ejemplos por Sector

### 14.1 Logistica

**Colecciones típicas:** Almacenes, Productos, Ubicaciones, Movimientos, Inventarios, Lotes
**Pantallas típicas:** Escaneo QR/código barras, Mapa de almacen, Lista de productos, Detalle de movimiento
**Integraciones:** Camara (escaneo QR), GPS (ubicaciones), Firma digital (recepciones)

**Ejemplo de colecciones:**
- Productos.xne - Catálogo con CODIGO_BARRAS, NOMBRE, STOCK, UBICACION
- Movimientos.xne - Entradas/salidas con TIPO, ID_PRODUCTO (FK), CANTIDAD, FECHA
- Inventarios.xne - Conteos con FECHA, ESTADO, OBSERVACIONES

### 14.2 Energía

**Colecciones típicas:** Instalaciones, Contadores, Lecturas, OrdenesTrabajo, Materiales, Checklists
**Pantallas típicas:** Ruta de lecturas, Detalle de contador, Formulario OT, Checklist
**Integraciones:** Camara (foto contador), GPS (ubicación), NFC (identificación equipo)

**Ejemplo de colecciones:**
- Contadores.xne - Puntos de lectura con NUMERO_SERIE, TIPO, DIRECCION, LATITUD, LONGITUD
- Lecturas.xne - Lecturas con ID_CONTADOR (FK), VALOR, FOTO, FECHA, ANOMALIA
- OrdenesTrabajo.xne - Mantenimiento con DESCRIPCION, PRIORIDAD, ESTADO

### 14.3 Comercio

**Colecciones típicas:** Clientes, Productos, Pedidos, LineasPedido, Facturas, Rutas
**Pantallas típicas:** Lista de clientes, Catálogo, Crear pedido, Historial
**Integraciones:** GPS (visitas), Firma digital (aceptacion), Bluetooth (impresora tickets)

**Ejemplo de colecciones:**
- Clientes.xne - Cartera con NOMBRE, CIF, DIRECCION, TELEFONO, SALDO
- Pedidos.xne - Con ID_CLIENTE (FK), FECHA, TOTAL, ESTADO
- LineasPedido.xne - Detalle con ID_PEDIDO (FK), ID_PRODUCTO (FK), CANTIDAD, PRECIO

### 14.4 Salud

**Colecciones típicas:** Pacientes, Citas, HistorialClinico, Tratamientos, Medicamentos
**Pantallas típicas:** Agenda, Ficha paciente, Historial, Prescripcion
**Integraciones:** Camara (fotos clinicas), Firma (consentimiento), Bluetooth (dispositivos)

**Ejemplo de colecciones:**
- Pacientes.xne - Con NOMBRE, DNI, FECHA_NACIMIENTO, GRUPO_SANGUINEO, ALERGIAS
- Citas.xne - Con ID_PACIENTE (FK), FECHA, HORA, MOTIVO, ESTADO
- HistorialClinico.xne - Con ID_PACIENTE (FK), DIAGNOSTICO, TRATAMIENTO, FECHA

### 14.5 Servicios

**Colecciones típicas:** Clientes, Servicios, PartesTrabajo, Materiales, Incidencias
**Pantallas típicas:** Lista trabajos, Detalle servicio, Parte trabajo, Mapa visitas
**Integraciones:** GPS (ubicación), Camara (antes/después), Firma digital (conformidad)

**Ejemplo de colecciones:**
- PartesTrabajo.xne - Con ID_CLIENTE (FK), DESCRIPCION, FECHA_INICIO, FECHA_FIN, ESTADO
- Materiales.xne - Con ID_PARTE (FK), NOMBRE, CANTIDAD, PRECIO
- Incidencias.xne - Con ID_PARTE (FK), DESCRIPCION, PRIORIDAD, FOTO, RESOLUCION

## 16. Prohibiciones Explicitas

### 16.1 Lo que NO se debe hacer NUNCA

#### En mappings.xne — REGLA ABSOLUTA

> **mappings.xne contiene UNICA Y EXCLUSIVAMENTE las colecciones `Empresas` y `Usuarios`. Sin excepciones.**

- **NO** añadir ninguna otra coleccion de negocio en `mappings.xne`, aunque sea pequeña, auxiliar o de apoyo
- **NO** añadir colecciones de catálogos, configuración, parámetros u otras en `mappings.xne`
- **TODA** coleccion adicional va en su propio fichero `.xne` independiente con el nombre de la coleccion

```
CORRECTO:
  mappings.xne        → solo Empresas y Usuarios
  Clientes.xne        → coleccion Clientes
  Productos.xne       → coleccion Productos
  LineasPedido.xne    → coleccion LineasPedido

INCORRECTO:
  mappings.xne        → Empresas + Usuarios + Clientes + Productos  ← PROHIBIDO
```

#### En XML (.xne)
- **NO** inventar atributos XML que no estén en la knowledgebase
- **NO** usar nodos HTML (div, span, table)
- **NO** omitir `##PREF##` en queries SQL
- **NO** omitir `objname` si la coleccion debe persistirse en BD
- **NO** omitir campos obligatorios en Empresas: `CODIGO` (N), `NOMBRE` (T)
- **NO** omitir campos obligatorios en Usuarios: `IDEMPRESA` (N), `CODIGO` (T), `LOGIN` (T), `PWD` (X), `NOMBRE` (T)
- **NO** usar valores de `visible` fuera del rango 0-7
- **NO** usar tipos de propiedades no documentados (ver sección 3.3)
- **NO** usar `L`/`TL`, `THTML`, `B` o `Z` como tipos de datos en BD — son solo visuales
- **NO** omitir `progid="ASData.CASBasicDataObj"` en colecciones de negocio
- **NO** escribir la clausula WHERE en el atributo `sql` — usar `filter` para los filtros
- **NO** escribir ORDER BY en el atributo `sql` — usar `sort` para la ordenacion
- **NO** usar px en dimensiones de props o frames — usar `p` (puntos) o `%`
- **NO** olvidar `newline="false"` cuando se quieren elementos en horizontal — sin él, cada elemento ocupa su propia línea aunque los anchos sumen 100%
- **NO** usar frames vacios como espaciadores — un frame sin props visibles no se renderiza ni ocupa espacio
- **NO** omitir el prefijo `MAP_` en campos que provienen de tablas enlazadas mediante JOIN — son campos de solo lectura que no se graban en BD
- **NO** usar el prefijo `MAP_` en campos propios de la tabla principal que si deben grabarse
- **NO** repetir el mismo `name` en dos nodos dentro de una `<coll>` — es una restricción crítica de la plataforma. **El ambito de unicidad es la `<coll>` ENTERA**, no el `<group>` o `<frame>` inmediato: no pueden existir dos `<prop>`, dos `<group>`, dos `<frame>` ni dos eventos con el mismo `name` en cualquier parte de la misma coll, **aunque estén en `<group>` o `<frame>` distintos**. Razón: el `name` se publica a nivel de la coll (los `collprops`), por lo que actuaria como identificador único ambiguo si se repitiera. Excepción: dos `<coll>` distintas SI pueden tener contenido identico (mismos `name` internos) siempre que el atributo `name` de cada coll sea distinto
- **NO** usar el mismo `name` en dos `<coll>` del proyecto — cada coleccion debe tener nombre único (este es el único `name` que NO puede coincidir entre colecciones)
- **NO** declarar eventos de control como nodos XML: `onclick`, `ontextchanged`, `onfocuschanged`, `oneditoraction`, `onlongpress`, `onlongpressitem`, `onscroll`, `onconsolemessage`, `oncodescanned`, `ondateselected`, `onpageselected`, `ondraweropened`, `ondrawerclosed`, etc. son **siempre atributos** del `<prop>`/`<frame>`/`<coll>` con JS inline como valor. Construcciones tipo `<onconsolemessage>...</onconsolemessage>` u `<onclick>...</onclick>` son XML invalidos y XOne las ignora silenciosamente. Unica excepción: `onchange` admite ambas formas (atributo y nodo hijo del prop). Los nodos hijos de `<coll>` que SI existen son eventos de objeto/coleccion (`<create>`, `<load>`, `<before-edit>`, `<after-edit>`, `<onback>`, `<onrefresh>`, `<login-ok>`, `<login-fail>`), no eventos de control

#### En CSS
- **NO** usar unidades web: px, em, rem, vh, vw
- **NO** usar propiedades CSS web: font-size, margin-top, background-color, display, flex, grid
- **NO** usar selectores web: #id, elemento > hijo, :hover, :focus
- **NO** usar media queries (`@media`) ni gradientes / sombras / transformaciones / transiciones de CSS web
- **SÍ** se pueden usar variables CSS (`:root { --color: red; }` + `var(--color)`), `calc(...)` sobre números puros y `@import "ruta";` al inicio del archivo

#### En JavaScript
- **NO** usar APIs del DOM — XOne no es HTML y no tiene navegador. Estas funciones NO existen en XOne: `document`, `document.getElementById`, `document.querySelector`, `window`, `window.location`, `localStorage`, `sessionStorage`, `XMLHttpRequest`, `navigator`, `history`. Para HTTP idiomático usar `$http`; para navegación usar `ui.*`; para datos usar `self.*` y `appData.*`.
- **SÍ existen** con implementación custom de XOne y semántica spec-compatible: `Promise` (ES2024 con `all`/`allSettled`/`race`/`any`/`withResolvers`/`.then`/`.catch`/`.finally`), `fetch`, `setTimeout`/`setInterval`, `URL`, `Headers`, `AbortController`, `EventTarget`, `TextEncoder`/`TextDecoder`, `console`, `performance.now()`. Úsalos si el caso lo pide; los callbacks XOne idiomáticos siguen siendo la forma preferida para APIs nativas (`$http.get(url, req, ok, err)`, `ui.startGps(cb)`, etc.).
- **NO** usar `async`/`await` (parse error).
- **NO** usar módulos ES6 (`import`/`export`).
- **NO** asumir que `this` funciona igual que en web (usar `self`).
- **NO** mezclar sintaxis de React, Angular, Vue u otros frameworks.
- **SÍ** se puede usar `class` ES6+ (declaraciones, expresiones, `extends`/`super`/`static`/getters/setters/computed keys, **field declarations** `name = expr;` y `static name = expr;`, **generator methods** `*method()`). Los generadores con `yield` (con o sin `*`) usan runtime estilo SpiderMonkey legacy: `gen.next()` devuelve el valor directo y lanza `StopIteration` al terminar; `for...of` no los itera, usar `try { while (true) v = iter.next(); } catch (e) {}`. Limitaciones: no hay private fields `#name`, static blocks, ni `new.target`.

#### En Estructura de Proyecto
- **NO** usar un prefijo diferente a "gen" sin autorización del usuario
- Los formatos validos para `icons/` son PNG, JPG y SVG
- **NO** omitir la generación de la base de datos con `xone_db_generator`
- **NO** omitir la insercion de datos iniciales (Empresa + Usuario admin)
- **NO** omitir los READMEs en las carpetas

### 16.2 Regla de Oro

> **Cuando hay duda, SIEMPRE consultar las knowledgebases del proyecto antes de tomar una decisión. Si no hay documentación suficiente, buscar en los proyectos de ejemplo. Si aún así no hay respuesta, PREGUNTAR al usuario.**

---

*Documento generado como guía operativa para agentes de IA en la generación de proyectos XOne. Basado en el análisis de 224 proyectos reales, 5 proyectos sinteticos y la documentación oficial del sistema.*
