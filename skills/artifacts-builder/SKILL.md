---
name: artifacts-builder
description: "Build a self-contained interactive HTML artifact the user can view in the chat: dashboards, interactive charts, flow diagrams, filterable tables, printable reports. Use when a plain text answer would lose information that a visual or interactive piece would keep."
---

# Artifacts Builder

You write ONE self-contained HTML file. No build step, no npm, no `execute` anywhere this
skill is mounted — nothing here runs a script.

## Steps

1. **Pick a character and paste the tokens** — `reference/estilo.md`, one table row, whole.
   This is a STEP and not optional reading, and the reason is measured: while it lived under
   "read when you need it" the builder **never opened it**, and every panel came out the same —
   Inter, indigo accent, four different corner radii and zero CSS variables. Five tokens
   (`--surface --surface-2 --ink --ink-muted --border --accent --radius`) and one row of the
   character table are the whole decision; the file is 86 lines and it is the short one.
2. **Write** the HTML with `write_file`, e.g. `/artifact.html`. Keep it ONE file: with no
   `execute` tool anywhere here, there is no bundler to run. Inline local assets (fonts,
   images) as `data:` URIs directly in the file you write, instead of splitting it and
   planning to combine the pieces later.
3. **Entrega, según la tool que TENGAS:**
   - **Si tienes `publish_artifact`** (el panel): `publish_artifact(path="/artifact.html",
     title="…")`. Valida al publicar contra el contrato de abajo. Si lo rechaza, te dice
     exactamente qué arreglar; corrige y reintenta. Para actualizar uno que ya publicaste,
     pasa su `artifact_id` — el enlace del usuario no cambia.
   - **Si tienes `renderizar_diagrama` en vez de `publish_artifact`** (el camino de
     `documentar`): si lo que construiste es un DIAGRAMA (arquitectura, flujo, secuencia,
     dataflow, lifecycle), no sigas este camino — usa la skill `archify` y llama a
     `renderizar_diagrama(tipo, spec_json, ruta)`, que valida y coloca el fichero por ti.
     Para cualquier OTRO artefacto (tabla, dashboard, gráfica que no es un diagrama de
     archify), ya tienes `write_file`: escribe directamente en la ruta del proyecto — el
     contrato de abajo NO aplica en este camino, es del sandbox del panel (ver su nota).
   **Cuando la entrega confirme, HAS TERMINADO** — no reescribas el mismo artefacto otra vez.

## The contract — non-negotiable — solo si tienes `publish_artifact`

El artefacto corre en un sandbox cerrado. Esto lo hace cumplir el SERVIDOR de `publish_artifact`,
no la confianza — y por eso solo es cierto en este camino, no en el de `write_file`:

- **No network.** No `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`,
  dynamic `import()`. Bake the data into the HTML as a JS constant.
- **Libraries only from** `https://cdnjs.cloudflare.com` or `https://cdn.jsdelivr.net`
  (fonts: `fonts.googleapis.com` + `fonts.gstatic.com`). Pin an exact version.
- **Images**: `data:` URIs only. An external `<img src>` leaks data through its query string.
- **No** `<base>`, no external `<iframe>`, no external `<form action>`.
- **5 MB max.**
- **`localStorage` THROWS. Wrap every access in `try/catch` — or don't use it.** The widget
  renders the artifact in an iframe with `sandbox="allow-scripts allow-downloads allow-modals"`
  and **no `allow-same-origin`**, so the document has an opaque origin and merely *reading*
  `localStorage` raises:

  ```
  Failed to read the 'localStorage' property from 'Window':
  The document is sandboxed and lacks the 'allow-same-origin' flag.
  ```

  This is measured, not theoretical, and it is the **most expensive mistake in this list**
  because it fails SILENTLY. A real panel died on `'theme' in localStorage` before
  `mermaid.initialize(…)` ever ran, and the page looked perfect while the diagram stayed an
  empty rectangle. `matchMedia('(prefers-color-scheme: dark)')` needs no storage for the theme;
  if you really want to remember something per viewer, wrap it: `try { localStorage.setItem(k,
  v) } catch {}`.

**Si en vez de esto tienes `renderizar_diagrama` y entregas con `write_file`**: nada de lo de
arriba lo hace cumplir ningún servidor — el fichero queda tal cual en el proyecto del cliente,
sin iframe, sin lista blanca de CDN, sin tope de 5 MB. `localStorage` no lanza ahí. Sigue siendo
sensato no depender de red si el proyecto puede abrirse offline, pero no es una restricción
técnica de este camino.

## What you can use

React 18 (UMD), Tailwind, any chart library, mermaid, via CDN `<script>` tags — no bundler,
either path. **Con `publish_artifact`**, solo pasan `cdnjs.cloudflare.com` y `cdn.jsdelivr.net`
(`https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4`, NUNCA `cdn.tailwindcss.com`: no está en
la lista blanca). **Con `write_file`**, no hay lista blanca que cumplir — igual, usa esas dos
CDNs por defecto salvo que el proyecto ya traiga otra cosa.

## Read when you need it

- `reference/graficas.md` — interactive charts
- `reference/diagramas.md` — flow diagrams with mermaid
- `reference/exportar-pdf.md` — a working PDF export button
- `reference/estilo.md` — **el sistema visual (paso 1, no opcional)**: tokens, carácter, escala

## Rules of thumb

- Support dark and light: don't hardcode one color scheme.
- One page, one job. If it needs two unrelated screens, that's two artifacts (or two files).
- Bake enough data to be useful, not the whole dataset. Con `publish_artifact` el tope de 5 MB
  lo impone el servidor; con `write_file` no hay tope impuesto, pero un fichero de datos entero
  sigue siendo mala idea igual.
