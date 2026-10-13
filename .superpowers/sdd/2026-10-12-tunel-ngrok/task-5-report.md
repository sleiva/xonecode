# Task 5 — la cara (apps/web)

Hecho: store (lista blanca de `via`/`ngrok` y sus campos, `recetaDe` extraída y compartida con Dispositivos), `TunelNgrok.tsx` (+css, +test), `SesionRemota.tsx` (conmutador de vía, encender bloqueado sin ngrok listo, línea de vía y hint de «Visit Site»), sección «Sesión remota» en Ajustes (condicional a `remoto`), hilos en `App.tsx`.

Decisiones
- Dominio: lo decide el SERVIDOR; el cliente solo muestra `ngrok.motivo`. Sin segunda copia de la regla.
- La vía se elige SOLO en el diálogo (un control). La tarjeta de Ajustes no la repite.
- Abrir el diálogo ya NO enciende: el servidor rechaza `via` fuera de apagada/error, y encender al abrir dejaba la sesión en «abriendo» antes de llegar al conmutador. Ahora el diálogo trae un botón «Encender» (sustituido por explicación + «Abrir Ajustes» si ngrok no está listo). Se cambió el test que esperaba el encender al abrir.
- Receta de ngrok reutiliza `instalacion` y la acción `receta` existentes (`alEjecutarPaso("ngrok", n)`).
- Icono de la sección: `IconBrowseOutline16` (verificado en los exports de `lib/index.js`).

Verificación: typecheck limpio; `vitest run apps/web` 113 ficheros / 1962 tests verdes (más 2 en Ajustes); `build:web` ok.
