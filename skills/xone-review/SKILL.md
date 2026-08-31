---
name: xone-review
description: "Validar, verificar y revisar proyectos XOne con el linter xone-simulator. Usar al validar un proyecto, validar una coll suelta, hacer smoke de una app, ejecutar un evento concreto, renderizar una coll o una pantalla tras el login, corregir iterativamente los errores del validador, o auditar un proyecto o un cambio antes de entregarlo: códigos del validador, checklist de entrega y priorización de hallazgos por severidad. También para inspeccionar la base de datos del proyecto con xone-db-tools: esquema de una tabla y consultas SQL sobre gestion.db. Las reglas y anti-patrones de cada capa viven en xone-development."
---

# XOne Review

Verificación y revisión de proyectos XOne. Combina la validación automatizada con el CLI `xone-simulator` (paquete npm `xone-linter`), la validación de la BD con `xone-db-tools` y una revisión manual anclada a las reglas de `xone-development`.

**El linter dice qué está mal, no cuál es la forma correcta.** Para eso lee `xone-development`. No reportes como hallazgo ni apliques como arreglo nada que no puedas anclar al validador o a esas reglas.

## Precondiciones

```bash
command -v xone-simulator
```

Si no existe: `npm install -g xone-linter xone-db-tools`. Si está instalado pero el shell no lo encuentra, usa la ruta completa al binario global (comprueba `npm config get prefix`).

En Claude Code, `/xone-validate [ruta]` ejecuta el flujo de validación y corrección completo.

## Flujo

1. Comprueba que `xone-simulator` existe; si no, indícalo al usuario y detente.
2. `validate` y lee los issues. Prioriza `errors` sobre `warnings`.
3. Si existe `bd/gestion.db`, ejecuta `xone-db-tools validate-db ./proyecto/bd/gestion.db --project ./proyecto --json`.
4. Corrige **un tipo de error a la vez** y revalida tras cada tanda, para no introducir regresiones.
5. `smoke` sobre la app completa cuando `validate` pase.
6. Si `smoke` falla, aísla con `run` (evento concreto) y `render` (UI). Para una pantalla que está **detrás del login**, saca antes la sesión con `login --session` y pásasela a `render --session`.
7. Revisión manual contra las reglas de `xone-development` (ver «Qué revisar en cada capa»).
8. Prioriza los hallazgos y reporta con severidad, `archivo:línea` y causa raíz.

No des por cerrado el trabajo hasta que `validate` pase sin `errors` y `smoke` devuelva exit 0, o hasta que los `failures` restantes estén justificados.

**`validate-coll` queda fuera de este flujo, a propósito.** El flujo asume un proyecto completo; `validate-coll` es la entrada para cuando solo tienes un `.xne` suelto. Su veredicto es parcial por construcción, así que no cierra nada: en cuanto haya proyecto, se pasa `validate`.

## Comandos

Requieren `xone-linter >= 1.2.0` — `validate-coll`, `login` y `render --session` aparecieron en 1.1.0, y 1.2.0 es el suelo soportado. `describe-table` y `execute-sql` necesitan `xone-db-tools >= 0.2.0`.

```bash
xone-simulator validate      ./proyecto --json                 # verificación estática
xone-simulator validate-coll ./Clientes.xne --json             # UNA coll suelta, sin app.xml
xone-simulator smoke         ./proyecto --json                 # ciclo de vida completo
xone-simulator run           ./proyecto --coll X --event before-edit --json
xone-simulator render        ./proyecto --coll X               # coll a HTML
xone-simulator login         ./proyecto --user u --pass p --session ./sesion.json
xone-simulator render        ./proyecto --coll X --session ./sesion.json   # pantalla tras el login
xone-db-tools validate-db     ./proyecto/bd/gestion.db --project ./proyecto --json
xone-db-tools describe-table  ./proyecto/bd/gestion.db gen_clientes --json    # esquema de una tabla
xone-db-tools execute-sql     ./proyecto/bd/gestion.db "SELECT …" --json      # datos (¡también escribe!)
xone-db-tools execute-sql     ./proyecto/bd/gestion.db --file ./consulta.sql --json
```

**`validate`** comprueba XML bien formado y encoding, atributos obligatorios, unicidad de nombres, tipos de propiedad, `progid`, ficheros y estilos incluidos, sintaxis JS y referencias cruzadas (`mapcol`, `inherits`, `contents`, `openEditView`), más los anti-patrones documentados. Con `--json` devuelve `success`, `summary` e `issues` con severidad, fichero y mensaje.

**`validate-coll`** valida **una coll suelta**, sin `app.xml` ni el resto del proyecto. Es para cuando solo tienes el `.xne` —una coll recién escrita, un fichero recibido aparte—, no un sustituto de `validate`.

> **`"success": true` aquí NO significa que la coll esté bien.** Significa que no se halló nada
> entre los chequeos que **sí** se ejecutaron.

La respuesta trae un array **`skipped`** con lo que no se ha comprobado y por qué. **Léelo y
repórtalo junto al veredicto.** Sin el proyecto quedan fuera, entre otros:

- La sintaxis JS de los `<script>` de la coll (`JS_ASYNC_AWAIT` y compañía).
- Las referencias a nodos de la propia coll (`REF_NODE_MISSING`).
- Los handlers en ficheros `.js` (`REF_FUNC_MISSING`).
- Las referencias entre colls: `mapcol`, `mapfld`, `linkedto`, `<contents src>`.
- Los `<include>` y el `entry-point`.
- La composición del layout: la coll se valida **sin el layout inyectado**, así que los props, frames y eventos que aportaría `<include-layout>` quedan invisibles para el validador.

De los anti-patrones se ejecutan cinco de seis; solo se cae `ANTIPATTERN_VBSCRIPT`, que necesita
`app.xml`.

**`smoke`** dispara `create`/`before-edit`/`after-edit` más render con flow de todas las colls (o de `--coll X`). Con `--interact` además tapea los props con `onclick`/`method=ExecuteNode(...)` (máx. `--max-taps`, default 20). Exit code 1 si hay `failures`. Una coll rota no aborta el resto y cada fallo incluye su fase y el stack truncado. El entorno es siempre seguro: `network:'mock'` e in-memory, sin tocar red ni SQLite reales. Si `totals.stubWarnings > 0` en una coll que pasó, algún método fue absorbido por autostub (`kind: 'stub-method'`): no bloquea, pero repórtalo.

**`run`** ejecuta un evento a nivel de coll (`before-edit`, `create`, `onback`) o inline de prop (`onclick`, `onchange`, con `--prop` y `--data`). Devuelve estado y `log` de side-effects: navegación, mensajes, refrescos, HTTP, cambios de datos y errores.

**`render`** renderiza una coll a HTML con ciclo de vida (`--no-flow` para renderizar en frío). `--group N` renderiza una página concreta de un swipe, por su `id`. `--active-color <hex>` sustituye el valor de `MAP_COLORACTIVO`.

**`login` + `render --session` van juntos**, y ninguno sirve por separado: `login` ejecuta el `login()` **de la propia app** y vuelca la sesión a un fichero, que luego consume `render --session` para pintar pantallas que están detrás del login.

- **Completar significa salir de la coll de login.** Si al terminar se sigue en ella, el comando lo dice (`El login no completó: se sigue en "X"`), **no escribe el fichero de sesión** y devuelve **exit 1**. Que el script haya corrido no basta: en una prueba real se vio `appData.login(...)` ejecutarse y disparar su `onLoginSuccessful` con su toast, y aun así el login se consideró no completado por no haber navegado.
- **En el fallo imprime el log de side-effects** (`executeNode`, `appData.login`, mensajes), que es por dónde se empieza a diagnosticar.
- **Los defaults casi nunca encajan.** Son `--coll Login`, `--user-prop MAP_EMAIL`, `--pass-prop MAP_PASS`, `--login-prop MAP_LOGIN_BTN`, `--boot EntradaApp` y `--timeout 30`. Un proyecto que llame a las cosas de otra manera necesita los cuatro overrides —por ejemplo `--coll LoginColl --user-prop MAP_USUARIO --pass-prop MAP_PASSWORD --login-prop MAP_LOGIN`—. Antes de dar por roto el login, comprueba que apuntas a la coll y los props que el proyecto realmente tiene.

`--db-path` debe apuntar a una **copia** de la base de datos: el simulador puede mutarla. `--db-prefix` fija el prefijo de tablas, y está disponible en `run` y en `render`.

### Leer datos de la BD

Además de `validate-db`, `xone-db-tools` tiene dos comandos que **devuelven datos**, y son la forma de responder «¿qué hay realmente en la base?» sin abrir SQLite a mano.

**`describe-table <gestion.db> <tabla>`** devuelve el esquema: por cada columna, `position`, `name`, `type`, `nullable`, `default` y `primaryKey`. Con `--json` sale estructurado; sin `--json`, como tabla legible. Es lo que confirma si una columna existe y con qué tipo, antes de culpar al XML.

**`execute-sql <gestion.db> "<sql>"`**, o `--file <consulta.sql>` para una consulta larga, ejecuta SQL arbitrario. Un `SELECT` devuelve un array de objetos fila; una escritura devuelve `{changes, lastInsertRowid}`.

> **`execute-sql` NO es de solo lectura: ejecuta lo que le pases, incluidos `INSERT`, `UPDATE`, `DELETE` y DDL, y muta el fichero.** Comprobado. Trabaja siempre sobre una **copia** de `gestion.db`, igual que con `--db-path` del simulador, y no lo apuntes a la BD del repositorio. Para inspeccionar, limítate a `SELECT`.

Recuerda el contrato del generador: tablas en minúsculas con prefijo `gen_`, campos en mayúsculas — por eso las consultas son de la forma `SELECT NOMBRE FROM gen_clientes`.

## Códigos del validador

### Errores

| Código | Significado |
|--------|-------------|
| `XML_PARSE` | XML mal formado en un `.xne` |
| `INVALID_PROP_TYPE` | Tipo de prop no soportado |
| `PROP_MISSING_NAME` / `PROP_MISSING_TYPE` | Prop sin `name` o sin `type` |
| `COLL_MISSING_PROGID` | Coll con `objname` pero sin `progid` |
| `GROUP_MISSING_ID` | Grupo sin atributo `id` |
| `APP_NO_ENTRY` | `app.xml` sin punto de entrada (`entry-point`) |
| `DUPLICATE_COLL_NAME` | Nombre de colección duplicado |
| `DUPLICATE_NAME_IN_COLL` | Nombre repetido dentro de una coll |
| `REF_MAPCOL_MISSING` | `mapcol` apunta a una coll inexistente |
| `REF_CONTENTS_SRC_MISSING` | `contents src` apunta a una coll inexistente |
| `REF_INHERITS_MISSING` | `inherits` apunta a una coll inexistente |
| `ANTIPATTERN_MULTIPLE_BEFORE_EDIT` | Más de un `before-edit` en la misma coll |
| `ANTIPATTERN_SELF_AS_FUNCTION` | `self` usado como función |
| `ANTIPATTERN_MACRO_SYNTAX` | `macro` llamado como método de `coll` |
| `ANTIPATTERN_SELF_LOCK` | `lock`/`unlock` llamados sobre `self` |
| `ANTIPATTERN_VBSCRIPT` | Include con `language="vbscript"` (descontinuado) |
| `JS_SYNTAX` | Error de sintaxis JavaScript |
| `JS_TEMPLATE_LITERAL` | Template literals no soportados |
| `JS_ASYNC_AWAIT` | `async`/`await` no soportados |

### Warnings

| Código | Significado |
|--------|-------------|
| `ANTIPATTERN_LOAD_EVENT` | Se usa `<load>`; preferir `<before-edit>` |
| `REF_MAPFLD_MISSING` | `mapfld` no es campo de la coll de `mapcol` |
| `REF_LINKEDFIELD_MISSING` | `linkedfield` no es campo de la coll de `mapcol` |
| `REF_JS_COLL_MISSING` | Script referencia una colección inexistente |
| `REF_NODE_MISSING` | Referencia a nodo o evento inexistente |
| `REF_FUNC_MISSING` | Referencia a función inexistente |

Los códigos son case-sensitive. Cada warning debe justificarse o corregirse.

## Qué revisar en cada capa

Las reglas y los anti-patrones de cada capa viven en la skill `xone-development`, que es donde se escriben una sola vez. Antes de marcar un hallazgo, contrástalo allí:

- Reglas transversales, tipos de prop, visibilidad, ciclo de vida y sintaxis del motor: `xone-development/SKILL.md`.
- Anti-patrones por área (XML, JavaScript, CSS, datos, dispositivo): sección «Anti-patrones» de `xone-development/SKILL.md`.
- Detalle de un atributo, una API o un valor admitido: el índice de referencias de `xone-development/SKILL.md`.

**No reportes como hallazgo nada que no puedas anclar al validador o a esas reglas.**

## Checklist de entrega

- [ ] `validate` sin errores; warnings justificados o corregidos.
- [ ] `smoke` con exit 0.
- [ ] Pantallas nuevas siguen la jerarquía de `xone-development`.
- [ ] Colls de datos con `sql`, `objname` y `updateobj`; `progid` según la regla de `xone-development`.
- [ ] `##PREF##` en toda SQL de colección.
- [ ] Todo `unlock` con su `lock` en `finally`; todo `startBrowse` con su `endBrowse`.
- [ ] Cursores y conexiones SQL cerrados, patrón de `xone-development`.
- [ ] Callbacks asíncronos preservando `self`.
- [ ] Validación de entrada antes de `save()`.
- [ ] SQL parametrizado.
- [ ] CSS con unidades (`p`/`%`) y colores (`#AARRGGBB`) correctos.
- [ ] `allowUnsafeCertificates: false`; sin credenciales hardcodeadas.
- [ ] Solo se han tocado los `.xne` fuente (regla en `xone-development`).

## Severidad y reporte

| Severidad | Definición | Acción |
|---|---|---|
| Crítico | Bloquea entrega: error del validador, SQL injection, `before-edit` duplicado, referencias rotas | Corregir antes de entregar |
| Alto | Riesgo de bug en runtime: `self` en callback, lock sin `finally`, `-8100` por no validar | Corregir en el mismo cambio |
| Medio | Mala práctica o rendimiento: `load`, refresh global, espera bloqueante | Corregir o registrar deuda técnica |
| Bajo | Estilo y consistencia: nombres, comentarios, organización del CSS | Sugerencia, no bloqueante |

Reporta cada hallazgo con `archivo:línea`, severidad, código del validador si existe, y causa raíz con la corrección propuesta. Al final indica qué se corrigió, qué se verificó (`validate` + `smoke`) y qué no has podido verificar, incluidas las limitaciones del sandbox.

## Diagnóstico rápido

- XML mal formado o encoding → revisa el prólogo y que el `encoding` declarado coincida con cómo está guardado el `.xne`.
- Pantalla vacía → XML, primer `newline` de cada fila, nombres duplicados, `visible`/`disablevisible`, `special` junto a `sql` y `compatibility-mode`.
- Inicialización que no ocurre → mueve la lógica de `load` a `before-edit` o `create`.
- Coll que falla en `smoke` pero no en `validate` → `run` con `--json` para ver el stack de runtime.
- Muchos `stubWarnings` → reporta qué APIs del sandbox no están cubiertas; no son errores bloqueantes.

## Fuente de las reglas

Los códigos del validador vienen del paquete `xone-linter`; las reglas de cada capa, de la skill `xone-development`. Para confirmar la forma correcta de algo antes de marcarlo como hallazgo o de aplicar un arreglo, lee `xone-development/SKILL.md` y su índice de referencias.

Para diagnosticar un fallo a partir de su síntoma, usa `xone-debugging`.
