# El diseño del dashboard (Stitch), y qué se puede sostener de él

El original está anclado en `docs/diseno/dashboard-stitch.html` — el `code.html` del paquete
`stitch_xonecode_app_platform.zip` que generó Stitch, copiado tal cual. `docs/diseno/splash-stitch.png`
es la otra pantalla del mismo lote (el arranque), que ya está implementada (`Splash.tsx`,
`PantallaDeArranque.tsx`). Se guardan aquí porque un diseño que vive en `~/Downloads` no
existe para la siguiente sesión: es lo que pasó con éste.

Este documento no es un resumen del HTML. Es la lista de **qué pieza tiene un dato detrás y
cuál no**, que es la única pregunta que decide si se puede pintar. La regla del repo no
cambia por venir de un diseño: un control sin nada detrás es la misma mentira que una lista
vacía rellenada con un placeholder.

## La estructura, que sí coincide

El diseño es la maqueta que ya existe: barra lateral a la izquierda, cabecera con pestañas
(Chat / Trajectory), transcript al centro y compositor abajo. Eso ya está montado
(`Maqueta.tsx`, `Barra.tsx`, `Cabecera.tsx`, `Transcript.tsx`, `Compositor.tsx`), así que lo
que aporta el diseño no es la disposición sino tres cosas concretas:

| pieza del diseño | estado |
|---|---|
| Árbol entorno → proyecto → sesión en la barra | **ya está**, y con los datos de verdad |
| «New Session» como botón ancho arriba de la barra | falta: hoy el «+» vive en la fila del proyecto |
| Sesión activa con punto y barra de acento | **ya está** (`proyectoActivo`/`sesionActiva`) |
| Varios entornos en el árbol, colapsables | falta: hoy es un `<select>` y solo uno activo |
| Buscar / filtrar / nuevo entorno en la cabecera de «Workspaces» | falta el buscador; «nuevo entorno» está en Ajustes |
| Pastilla de modelo en el compositor | **ya está** |
| Pestañas Chat / Trajectory | **ya está** |
| Cabecera azul (`#083b56`) con la marca y el modo | falta: hoy la cabecera es clara |

## Lo que el diseño enseña y xonecode NO sabe hacer todavía

Más de la mitad del mockup es un **puente con dispositivos** que este producto no tiene
cableado. Nada de esto puede pintarse sin mentir:

- **Panel «Connected Devices»** (iPhone 15 Pro · USB · 98%, Pixel 8 · Wi-Fi · 82%), las
  tarjetas de dispositivo del transcript, «Launch on Device», «Logs»/«Logcat», «Inspect».
- **«Build & Run»** y «Run on All Devices Now».
- **Hot reload / Fast Refresh**, «Sync: Active», el badge «Xone Native Bridge v4.2».
- **Pie de estado**: «ADB status: daemon active (port 5037)», «iOS Tunnel: usbmuxd synced».
- **Selector de destino** en el compositor («Target: All Devices»).
- **«Session log»** en la cabecera.

Existir, existen: el MCP de CloudStudio publica `studio_device_connect`, `studio_device_*`,
`studio_compile`… Pero **xonecode no los invoca desde ningún sitio** — su regla es que las
tools remotas no se inyectan en el agente y las ejecuta el CLI (`CLAUDE.md`), y hoy solo se
ejecutan las de descarga y subida. Pintar esas tarjetas antes de cablear eso serían botones
que no hacen nada, que es exactamente lo que llevamos dos días quitando.

## Lo que sí se puede tomar del diseño hoy

En orden de valor por línea:

1. **El árbol de entornos**, con todos los registrados y sus proyectos colapsables, en vez
   del `<select>`. El dato ya viaja entero (`registrados`, `proyectos`, `sesiones`,
   `entornoActivo`); lo que falta es que el listado de proyectos sea por entorno y no solo
   del activo — hoy `proyectos` es una consulta a CloudStudio del entorno activo, así que un
   árbol con TODOS exigiría una consulta por entorno o pintarlos vacíos hasta que se
   despliegue el suyo (lo segundo es honesto y barato).
2. **«New Session» arriba**, que es la acción principal de la barra y hoy está escondida en
   el `:hover` de una fila.
3. **La cabecera oscura y la marca**, que es lo que hace que la pantalla se lea como el
   splash que ya existe. Es CSS sobre lo montado.
4. **El buscador de la barra**, que es filtrado local sobre datos que ya están.

## Lo que del diseño hay que traducir, no copiar

- La paleta `brand` que trae el HTML es **índigo de Tailwind** (`#6366f1`), y encima se usa
  a la vez que el cian de XOne (`#00a3e0`) y el azul profundo (`#083b56`). Dos acentos que
  compiten. Lo de XOne es lo segundo; el índigo es relleno de la herramienta.
- El HTML es Tailwind por CDN. El cliente de este repo usa el CSS de deepseek con tokens
  (`apps/web/estilos/design-platform.css`) y CSS Modules, y hay un test que prohíbe colores
  literales en nuestras hojas (`Barra.test.tsx`). Traducir significa **alias de token**, no
  `bg-slate-100`.
- El mockup está en inglés («Workspaces», «New Session», «Settings»); el producto está en
  castellano.
