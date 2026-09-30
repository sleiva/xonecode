---
name: xone-plan-builder
description: "Descomponer el PLAN.md (spec) de xone-spec-builder en un plan de ejecución (TASKS.md): tareas tracer-bullet verticales con dependencias explícitas. Valida el spec, descompone en cortes verticales (coll + pantalla + eventos + estilo), cada uno demoable y comprobable en el aparato. Dependencias naturales XOne: mappings.xne → colls base → colls negocio → pantallas entidad → pantallas especiales → integraciones dispositivo (GPS, cámara, firma DR, escáner, biometría) → estilo → sincronización → validación. Prefactoring: reestructuras que facilitan el cambio. Refactors amplios: expand-contract. Quiz al usuario: granularidad, dependencias, partición. Tareas: una por context window, qué entrega (no cómo), bloqueada por, criterios verificables. Hitos que cierran con una comprobación en el aparato. Es análisis, no entrevista: no toma decisiones de diseño, si el spec tiene huecos lo devuelve a xone-spec-builder."
---

# XOne Plan Builder

Lee el `PLAN.md` (el spec) producido por `xone-spec-builder` y lo descompone en un **plan de ejecución**: una lista de tareas **tracer-bullet verticales**, cada una con sus dependencias explícitas. El resultado es `TASKS.md`, que `xone-project-generator` (app nueva) o `xone-development` (sobre existente) consumen una tarea a la vez.

Esta skill es **análisis y descomposición**, no entrevista. No afina el dominio ni toma decisiones de diseño —eso ya está resuelto en el `PLAN.md`—. Si el spec tiene pendientes o decisiones sin resolver, **devuélvelo a `xone-spec-builder`** en vez de inventar las respuestas.

> **Carga `xone-development` antes de descomponer.** Necesitas conocer las dependencias naturales entre colls, pantallas, eventos y estilo para secuenciar bien las tareas. Toda afirmación sobre XOne debe venir de sus referencias.

## Flujo

```
xone-spec-builder  →  PLAN.md (el spec)
xone-plan-builder   →  TASKS.md (el plan de ejecución)  ← esta skill
xone-project-generator  /  xone-development  →  ejecutan una tarea cada vez
arnés + device-controller →  valida: el verificador al cerrar el turno, el aparato con toques reales
```

## Estructura de archivos

Todo vive en **la carpeta del plan**, `/planes/<nombre>/`, NUNCA en la raíz del proyecto: un plan
no es parte de la app del cliente, y lo que se escribe en la raíz entra en el commit del turno y
sube a CloudStudio. Escribe tu `TASKS.md` **en la misma carpeta de la que leíste el `PLAN.md`**,
no en otra: quien desarrolle va a buscarlo ahí. Y el nombre es **EXACTO** — nada de
`tareas.md` ni variantes: dos ficheros con las mismas tareas son dos fuentes de verdad, y la
que nadie marca se queda vieja.

```
/planes/favoritos/
├── PLAN.md                 ← entrada (producido por xone-spec-builder)
├── TASKS.md                ← salida (esta skill)
├── CONTEXT.md              ← glosario (ya existe del spec-builder)
└── adr/
```

Si no existe `PLAN.md`, **detente y pide al usuario que ejecute `xone-spec-builder` primero**. No se puede descomponer lo que no está especificado.

## El `TASKS.md` se ACTUALIZA, no se archiva

`**Estado:**` EMPIEZA por una de cuatro palabras —`pendiente`, `en curso`, `implementada` (el
código está escrito) o `hecha` (y además comprobado)— y lo mantiene **quien ejecuta la tarea**, en
este mismo fichero y en esta misma carpeta. Las casillas de los criterios se marcan `- [x]`
cuando ese criterio está comprobado, no cuando se escribió el código que debería cumplirlo; lo
que se comprueba en el aparato lo marca `device-controller`. Una tarea está **finalizada** cuando
todas sus casillas están marcadas, y es lo que la pestaña Planes resume.

Cada tarea es una cabecera `### NN — Título` (no `## T1`), con sus casillas debajo.

**El plan también recuerda lo grave.** `TASKS.md` lleva una sección `## Hallazgos` (vacía al crear
el plan): quien descubre algo que cambia cómo se trabaja —con su causa medida, no una sospecha— lo
apunta ahí en cuanto lo sabe, y quien empiece un encargo con plan la lee primero. Cada sesión empieza
sin memoria: en una calculadora hecha por los agentes, un display que no se repintaba se diagnosticó
en una sesión que se cortó antes de arreglarlo, no quedó escrito, y siguió sin funcionar siete
pasadas más. Y si el encargo trae un diseño, se destila UNA vez en `DISENO.md` al lado del plan.

Ésa es la razón de que el plan viva en `/planes/` y no entre los artefactos: no es un documento
que se entrega una vez, es el estado compartido entre quien planifica y quien desarrolla, a lo
largo de varios turnos y varias sesiones.

## Precondiciones

Antes de descomponer, valida el `PLAN.md`:

1. **Existe** y tiene el tipo de desarrollo declarado.
2. **No tiene pendientes bloqueantes.** Si §Pendientes tiene preguntas que impiden descomponer (p. ej., «¿hay multiidioma?» afecta a si se crea `lang/`), devuelve el spec a `xone-spec-builder`. Pendientes que no bloquean la descomposición se marcan en la tarea correspondiente como nota, pero no paran el plan.
3. **El modelo de datos está completo** — colls, campos, tipos, relaciones.
4. **Las pantallas están identificadas** con propósito y contenido.

Si algo falta, no lo inventes: devuelve a `xone-spec-builder` con una nota específica de qué falta.

## Descomposición en tareas tracer-bullet

### Qué es una tarea tracer-bullet

Una tarea es un **corte vertical** que atraviesa todas las capas que necesite para entregar un comportamiento completo y verificable:

- **Vertical, no horizontal.** «Crear coll Clientes + su pantalla de lista + su pantalla de edición + su estilo» es vertical. «Crear todas las colls» es horizontal —no es una tarea, es una capa.
- **Demoable o verificable por sí sola.** Al cerrar la tarea, hay algo que funciona de principio a fin y se puede comprobar: el verificador del arnés (corre `xone-simulator validate` solo, al cerrar cada turno que escribió) y la comprobación en el aparato de `device-controller`.
- **Cabe en una sesión de agente.** Si una tarea es tan grande que no cabe en un context window, pártela.
- **Declara sus dependencias.** Qué tareas deben cerrarse antes de que ésta pueda empezar.

### Dependencias naturales en XOne

El orden de ejecución sigue las dependencias del framework:

```
1. Estructura base y configuración          (app.xml, app.ini, mappings.xne, default.css)
   ↓  — solo app nueva
2. Colecciones base del modelo de datos     (Empresas, Usuarios en mappings.xne)
   ↓
3. Colecciones de negocio                   (Clientes, Pedidos, LineasPedido…)
   ↓  — una tarea por coll o por grupo de colls relacionadas
4. Pantallas de entidad                     (lista → edición, por coll)
   ↓  — dependen de su coll
5. Pantallas especiales                     (Login, EntradaApp, MenuPrincipal)
   ↓  — app nueva; pueden ir en paralelo con 3-4
6. Integraciones de dispositivo             (GPS, cámara, firma, escáner…)
   ↓  — dependen de la coll/pantalla que las aloja
7. Estilo                                   (default.css, variantes)
   ↓  — puede ir en paralelo desde el principio; ajuste fino al final
8. Sincronización y seguridad               (réplica, OAuth2, tokens…)
   ↓  — si el desarrollo la toca
9. Comprobación en el aparato               (device-controller; el verificador del arnés corre solo)
```

### Reglas de secuenciación

- **`mappings.xne` primero.** Empresas y Usuarios deben existir antes que cualquier coll de negocio que haga combo a Empresas.
- **Una coll antes que su pantalla.** No se puede crear la pantalla de edición de Pedidos sin que la coll Pedidos exista.
- **`inherits`/`<include-layout>` antes que las colls que los consumen.** Si se define una coll base `special="true"` para herencia, va antes que las colls que heredan de ella.
- **El comportamiento se comprueba ANTES que el pulido.** En una pantalla interactiva, la tarea «la app reacciona a un toque» —una captura antes y otra después de la zona que debe cambiar— va justo detrás del esqueleto visual y antes de cualquier tarea de aspecto fino. Si no, se pule algo que no funciona: medido, un display que no se repintaba vivió siete pasadas de retoques visuales.
- **Estilo en paralelo.** `default.css` con las clases base puede empezar desde la tarea 1, pero el ajuste fino de pantallas específicas va después de que la pantalla exista.
- **Integraciones después de su contenedor.** La firma DR en Pedidos va en una tarea que depende de que Pedidos (coll + pantalla de edición) ya exista.
- **Comprobación al final de cada hito.** Si el plan tiene varios hitos, cada uno cierra con una tarea de comprobación en el aparato (`device-controller`); la validación estática la hace el verificador del arnés solo.

### Prefactoring

Antes de partir el trabajo, busca oportunidades de **prefactor** que hagan la implementación más fácil —«facilita el cambio, luego haz el cambio fácil». Si el proyecto existente tiene código que conviene reestructurar antes de añadir la feature nueva (p. ej., migrar `load` a `before-edit` en las colls que se van a tocar), esa prefactor va como **primera tarea**, bloqueando a las que dependen de ella.

Solo propón prefactor si el spec lo justifica o si al leer el proyecto existente es evidente. No inventes refactor fuera del scope.

### Refactors amplios: la excepción a las tareas verticales

Un **refactor amplio** es un cambio mecánico cuyo **radio de explosión** cubre todo el proyecto —renombrar una coll, cambiar el tipo de un campo compartido, migrar de `load` a `before-edit` en todas las colls—. No se puede partir en un corte vertical porque un solo edit rompe miles de sitios. Secuenciálo como **expand–contract**:

1. **Expand:** añade la nueva forma junto a la vieja, sin romper nada.
2. **Migra** los sitios de uso en lotes (por carpeta, por módulo), cada lote su propia tarea bloqueada por el expand, manteniendo el verificador del arnés en verde lote a lote.
3. **Contract:** borra la forma vieja cuando nadie la usa, en una tarea bloqueada por todos los lotes.

Si el spec no describe un refactor amplio, no lo fuerces. Es excepción, no regla.

## Quiz al usuario

Presenta el desglose propuesto como una lista numerada. Por cada tarea muestra:

- **Título**: nombre descriptivo corto
- **Bloqueada por**: qué tareas deben cerrarse primero (o «Ninguna — puede empezar ya»)
- **Qué entrega**: el comportamiento end-to-end que esta tarea hace funcionar

Pregunta al usuario:

- ¿La granularidad es correcta? (demasiado gruesa / demasiado fina)
- ¿Las dependencias son correctas —cada tarea solo depende de las que genuinamente la bloquean?
- ¿Falta fusionar o partir alguna?

Itera hasta que el usuario apruebe el desglose. Luego escribe `TASKS.md`.

## TASKS.md

Ver [TASKS-FORMAT.md](references/TASKS-FORMAT.md) para la plantilla completa. Resumen:

```md
# Plan de ejecución — {Título del desarrollo}

**Spec de origen:** PLAN.md
**Tipo:** {app nueva | feature | refactor | integración | cambio de modelo | rediseño}

## Tareas

### 01 — {Título}
**Estado:** pendiente
**Qué entrega:** {comportamiento end-to-end, perspectiva del usuario — no lista de capas}
**Bloqueada por:** Ninguna — puede empezar ya
**Notas:** {si hay algo que el spec dejó pendiente que afecta a esta tarea}

- [ ] Criterio de aceptación 1
- [ ] Criterio de aceptación 2

### 02 — {Título}
**Estado:** pendiente
**Qué entrega:** …
**Bloqueada por:** 01
…

## Orden de ejecución

{lista numerada en orden de dependencias, o un grafo simple}

## Hitos

{si aplica: qué conjunto de tareas forma un hito comprobable en el aparato}
```

## Reglas

- **Una tarea = un context window.** Si no cabe, pártela.
- **Decisiones, no código.** No pegues XML/JS/CSS en las tareas. Describe el comportamiento y qué se logra.
- **Nombres consistentes con el spec**, y el `MAP_` según `xone-development`.
- **No inventes lo que el spec no dice.** Si falta algo para descomponer, devuelve a `xone-spec-builder`.
- **Evita rutas de archivo o snippets de código específicos** —envejecen rápido. Excepción: si un prototipo o el spec produjo un snippet que codifica una decisión más preciso que prosa (esquema, state machine), inclúyelo y nota su origen.
- **La comprobación es una tarea.** Si el plan tiene hitos, cada hito cierra con una tarea de comprobación en el aparato. Si no, al menos una al final. No nombres herramientas que no estén en las skills de los especialistas: quien ejecuta las buscará.

## Cierre

Antes de entregar `TASKS.md`:

- [ ] Cada tarea es un corte vertical completo y verificable.
- [ ] Cada tarea declara sus dependencias correctamente.
- [ ] El orden de ejecución respeta las dependencias naturales de XOne (mappings → colls → pantallas → integraciones → estilo → validación).
- [ ] No hay tareas que dependan de cosas que el spec no especifica —o están marcadas como notas.
- [ ] El usuario aprobó el desglose.
- [ ] Las tareas de comprobación en el aparato están en su sitio.

Al entregar, señala el siguiente paso: `xone-project-generator` (app nueva) o `xone-development` (sobre existente) ejecutan una tarea cada vez, y el verificador del arnés (al cerrar cada turno) y device-controller en el aparato validan los hitos.

## Referencias

- [references/TASKS-FORMAT.md](references/TASKS-FORMAT.md) — Plantilla de `TASKS.md` y formato de cada tarea.

Las reglas de XML, JavaScript, CSS, datos y dispositivo viven en `xone-development`. El spec que esta skill consume, en `xone-spec-builder`. El generador de proyectos, en `xone-project-generator`.