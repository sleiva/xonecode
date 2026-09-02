---
name: archify
description: Create polished, validated architecture, workflow, sequence, data-flow, and lifecycle/state diagrams as explorable standalone HTML with inline SVG, dark/light themes, optional trace motion, and PNG/JPEG/WebP/SVG/WebM export. Accept plain-language requirements or pasted Mermaid flowchart, sequenceDiagram, and stateDiagram input; inspect repository evidence when the diagram must reflect real code. Use when the user asks to visualize system architecture, infrastructure, cloud/security/network topology, technical workflows, API call sequences, request lifecycles, data pipelines, ETL/ELT, data lineage, state machines, or to convert/beautify Mermaid.
license: MIT
metadata:
  version: "2.17"
  author: tt-a1i
  based_on: Cocoon-AI/architecture-diagram-generator (MIT, v1.0)
---

# Archify

Create a diagram: architecture, workflow, sequence, dataflow, or lifecycle.

## Aquí no hay terminal

No tienes `execute`, ni Node, ni Python, en ningún nodo del harness que monta esta skill. No
existe ningún paso que corra un comando — ni para autorar, ni para comprobar actualizaciones,
ni para revisar el HTML en un navegador a 1440×900 ni a ningún otro tamaño.

## Type router

| Type | Use for |
|---|---|
| `architecture` | Components, services, cloud/security boundaries, infrastructure |
| `workflow` | Processes, approval gates, tool calls, runbooks, CI/CD |
| `sequence` | API call chains, request lifecycles, async traces, returns |
| `dataflow` | Pipelines, ETL/ELT, lineage, governance, consumers |
| `lifecycle` | State/status transitions, retries, waiting and terminal states |

## Nombres reales, tal cual

Un identificador de ESTE proyecto — `LogonColl`, `Productos.xne`, un endpoint, un `.db` — se
preserva EXACTO, en cualquier camino: el motor de Archify (Camino A) o tu SVG/mermaid a mano
(Camino B). Localiza la prosa que los rodea, nunca esas piezas — un nombre inventado o
parafraseado hace que el diagrama describa un proyecto que no existe.

## Primero: qué tool tienes

Elige tu camino por la tool que TENGAS — son dos mecanismos distintos, no dos gustos:

- **Tienes `renderizar_diagrama`** (el camino de `documentar`): sigue el **Camino A**. Todo lo
  que hay dentro de él —esquema, JSON, `meta.quality_profile`, `brand`, el HTML que describe—
  es vocabulario del MOTOR de archify: solo tiene sentido si vas a llamar a esa tool.
- **Tienes `publish_artifact`** en vez de `renderizar_diagrama` (el panel): el motor de archify
  no es alcanzable desde aquí. Nada del Camino A aplica — salta directo al **Camino B**.

## Camino A — solo si tienes `renderizar_diagrama`

1. Lee **un** esquema de `schemas/` (más `schemas/common.schema.json`) y **un** ejemplo de
   `examples/` del tipo que toque. Solo esos dos: el ejemplo es para la FORMA de los campos,
   nunca para sus datos ni para nombres reales.
2. Escribe el JSON: un camino principal claro, ramas cortas, etiquetas escasas, como mucho 12
   nodos primarios. Fija `meta.quality_profile: "showcase"` salvo que pidan un mapa denso.
3. Llama a `renderizar_diagrama(tipo, spec_json, ruta)`. Valida antes de renderizar y coloca el
   fichero en el proyecto — **tú no escribes el HTML ni lo lees**. Si devuelve diagnósticos,
   corrige **solo el `subject` que nombran**, elige de `supportedFixes` y vuelve a llamar; si
   dos rondas seguidas no mejoran el número de errores, para y reporta los diagnósticos sin
   resolver. **Cuando la tool diga que quedó colocado, HAS TERMINADO** — no lo abras para
   comprobarlo, y no repitas la llamada sobre un spec que ya validó.

Si te pasan Mermaid (`flowchart`, `sequenceDiagram`, `stateDiagram`) en vez de una
descripción en prosa: mapeo de tipos y la regla de no copiar su estilo, en
`references/authoring-contract.md` — solo si tienes `renderizar_diagrama`.

### Invariantes de autoría — solo si tienes `renderizar_diagrama`

- Un camino principal obvio; quita aristas de poco valor antes de añadir routing.
- `meta.visual_preset` por omisión es `classic`; solo se cambia si el usuario pide ese estilo.
- Nunca inventes `meta.subtitle`, `brand`, ni un nombre de producto que el usuario no dio.
- Tipos de componente: `frontend`, `backend`, `database`, `cloud`, `security`, `messagebus`,
  `external`; variantes `default`, `emphasis`, `security`, `dashed`.
- Una etiqueta de relación es un HECHO semántico: si colisiona, muévela o acórtala — nunca la
  borres para «arreglar» la geometría.
- Sin un brand real ya conocido en el esquema, omite `brand`: capturar uno nuevo requiere red
  y `execute`, que aquí no existen.

Detalle completo (espaciado, orden de reparación, contratos de layout, evidencia de
repositorio) en `references/authoring-contract.md` — léelo solo cuando haga falta ese nivel.

### El HTML entregado — solo si tienes `renderizar_diagrama`

El HTML que produce `renderizar_diagrama` ya trae theme switching, pan/zoom, búsqueda, foco,
trazado de relaciones y export truthful (PNG/JPEG/WebP/SVG/WebM). Son capacidades del MOTOR, no
trabajo extra de autoría — no las repliques a mano, y no prometas ninguna de ellas si estás en
el Camino B, donde no existen. Detalle en `references/viewer-runtime.md`, solo si el usuario
pide explícitamente una de esas capacidades.

## Camino B — solo si tienes `publish_artifact`

Construye el diagrama tú mismo, como SVG o mermaid inline dentro de tu propio HTML
autocontenido — no hay JSON de Archify que escribir ni motor que lo consuma, así que no lleva
theme switching, pan/zoom, búsqueda ni export automático salvo que tú los programes. Sigue la
skill `artifacts-builder`, en concreto `reference/diagramas.md`, y publica con
`publish_artifact(path=..., title=...)`. **Cuando `publish_artifact` confirme, HAS TERMINADO.**

`references/delivery-contract.md` y `references/brand-marks.md` no son parte de ninguno de los
dos caminos — cada uno lleva su propio aviso de que nada en él se puede ejecutar.
