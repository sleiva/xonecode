# TASKS.md Format

`TASKS.md` es el entregable de `xone-plan-builder`: el plan de ejecución que `xone-project-generator` (app nueva) o `xone-development` (sobre existente) consumen una tarea a la vez.

## Estructura

```md
# Plan de ejecución — {Título del desarrollo}

**Spec de origen:** PLAN.md
**Tipo:** {app nueva | feature | refactor | integración de dispositivo | cambio de modelo de datos | rediseño de pantalla}
**Proyecto:** {nombre del proyecto XOne; "nuevo" si es app nueva}

## Tareas

### 01 — {Título}

**Qué entrega:** {comportamiento end-to-end, desde la perspectiva del usuario — no una lista de capas. Qué se puede demostrar o verificar al cerrar esta tarea.}
**Bloqueada por:** Ninguna — puede empezar ya
**Notas:** {opcional: si el spec dejó algo pendiente que afecta a esta tarea, o si hay una decisión de prefactor que conviene señalar}

- [ ] Criterio de aceptación 1
- [ ] Criterio de aceptación 2

### 02 — {Título}

**Qué entrega:** …
**Bloqueada por:** 01
**Notas:** …

- [ ] Criterio de aceptación 1
- [ ] Criterio de aceptación 2

## Orden de ejecución

{lista numerada en orden de dependencias, o un grafo simple. Ejemplo:}

1. 01 — Estructura base y mappings
2. 02 — Coll Clientes + pantalla lista + edición
3. 03 — Coll Pedidos + pantalla lista + edición (bloqueada por 01, 02)
4. 04 — Contents de LineasPedido en Pedidos edición (bloqueada por 03)
5. 05 — Login + EntradaApp + MenuPrincipal (bloqueada por 01)
6. 06 — Integración GPS + ClientesMapa (bloqueada por 02)
7. 07 — Firma DR en Pedidos (bloqueada por 03)
8. 08 — Estilo: default.css completo + variantes (en paralelo desde 01)
9. 09 — Validación xone-review (bloqueada por 02-08)

## Hitos

{si aplica: qué conjunto de tareas forma un hito verificable. Ejemplo:}

- **Hito 1 — CRUD básico:** tareas 01-04. Al cerrar, validar con xone-review.
- **Hito 2 — App completa:** tareas 05-09. Validación final.
```

## Plantilla por tarea

```md
### NN — {Título}

**Qué entrega:** el comportamiento end-to-end que esta tarea hace funcionar, desde la perspectiva del usuario — no una lista de capas a implementar.

**Bloqueada por:** los números/títulos de las tareas que gatean ésta, o "Ninguna — puede empezar ya".

**Notas:** (opcional) algo que el spec dejó pendiente que afecta a esta tarea, o una decisión de prefactor.

- [ ] Criterio de aceptación 1
- [ ] Criterio de aceptación 2
```

## Reglas

- **Una tarea = un context window.** Si una tarea no cabe en una sesión de agente fresca, pártela en dos.
- **Qué entrega, no cómo.** Describe el comportamiento logrado, no la lista de archivos a tocar. El ejecutor (`xone-project-generator` o `xone-development`) decide cómo.
- **Bloqueada por, no "después de".** Las dependencias son gateadores: una tarea no puede empezar hasta que todas las que la bloquean están cerradas.
- **Decisiones, no código.** Sin XML/JS/CSS pegado. Excepción: si un snippet codifica una decisión más preciso que prosa (esquema, state machine), inclúyelo y nota su origen.
- **Nombres consistentes con el spec**, y el `MAP_` según `xone-development`.
- **Evita rutas de archivo específicas.** Envejecen rápido. El ejecutor las infiere del spec y del proyecto.
- **Criterios de aceptación verificables.** Cada criterio debe poder comprobarse —con `xone-review`, con un smoke, o con un comportamiento observable.
- **La validación es una tarea.** Cada hito cierra con una tarea `xone-review`, o al menos una al final del plan.

## Ejemplo: feature sobre existente

```md
# Plan de ejecución — Firma de entrega en Pedidos

**Spec de origen:** PLAN.md
**Tipo:** feature
**Proyecto:** GestiónComercial (existente)

## Tareas

### 01 — Prefactor: migrar inicialización de Pedidos de load a before-edit

**Qué entrega:** Pedidos se inicializa con before-edit en vez de load, sin cambio de comportamiento visible. Desbloquea añadir la firma sin mezclar con el anti-patrón existente.
**Bloqueada por:** Ninguna — puede empezar ya
**Notas:** El spec señala que el proyecto usa load en Pedidos; conviene migrar antes de tocar la coll.

- [ ] Pedidos inicializa en before-edit, no en load
- [ ] xone-simulator validate pasa sin warnings de ANTIPATTERN_LOAD_EVENT
- [ ] Comportamiento de edición de Pedidos sin regresión

### 02 — Añadir prop DR de firma en Pedidos edición

**Qué entrega:** La pantalla de edición de Pedidos muestra un campo de firma digital (type="DR") que el usuario puede firmar y guardar.
**Bloqueada por:** 01

- [ ] Prop type="DR" visible en edición de Pedidos
- [ ] ui.saveDrawing guarda la firma en el campo
- [ ] ui.clearDrawing limpia la firma
- [ ] La firma persiste al guardar el pedido

### 03 — Validación

**Qué entrega:** El cambio pasa xone-simulator limpio y el smoke renderiza la firma correctamente.
**Bloqueada por:** 02

- [ ] xone-simulator validate sin errores
- [ ] xone-simulator smoke renderiza Pedidos edición con el campo DR
```

## Checklist de cierre

Antes de entregar el plan:

- [ ] Cada tarea es un corte vertical completo y verificable.
- [ ] Cada tarea declara sus dependencias correctamente.
- [ ] El orden respeta las dependencias naturales de XOne (mappings → colls → pantallas → integraciones → estilo → validación).
- [ ] No hay tareas que dependan de cosas que el spec no especifica —o están marcadas como notas.
- [ ] El usuario aprobó el desglose.
- [ ] Las tareas de validación xone-review están en su sitio.
- [ ] Los hitos (si los hay) están definidos y cierran con validación.