# TUI de xonecode — diseño

Fecha: 2026-09-01. Estado: aprobado para planificación.

## Qué es

Una piel de interfaz a pantalla completa para xonecode, construida con **Ink/React**,
en el estilo de OpenCode: área de transcript con scroll, input con borde, sidebar de
contexto, barra de estado, y aprobaciones como modal dentro de la interfaz.

Sustituye la decisión del «Camino A» (consola append-only como única cara): la consola
stdio **sigue existiendo** como piel para pipes/CI y como fallback, pero con un TTY de
verdad arranca la TUI.

## Por qué así

- **La frontera de `core/` ya lo contempla.** `core/turno.ts` consume eventos de dominio
  y delega el pintado en la interfaz `Piel`; `core/imports.test.ts` ya prohíbe
  langchain/ink/react en `core/`. La TUI es otra implementación de `Piel` — el motor no
  se entera.
- **Ink/React es el estándar del ecosistema** y lo que usa el propio OpenCode. El Camino
  A lo había excluido; esta decisión lo reaprueba expresamente.
- **Lo construido no se tira**: la cascada, el spinner, el panel de avisos y el diff de
  aprobación son semántica de presentación que la TUI re-expresa. En TUI el repintado es
  total, así que el panel de avisos desaparece como problema (el spinner de fase es un
  componente animado y las notificaciones son líneas más del transcript).

## Alcance v1

**Entra:**

- Layout de dos columnas: transcript con scroll (izquierda) y sidebar (derecha).
- Input con borde: historial con ↑/↓, Tab completa comandos desde `COMANDOS` y ficheros
  del proyecto tras `@`, Enter envía.
- Transcript: respuesta del modelo en markdown, fases como cabeceras de turno con
  duración (estilo «+ Thought: 1.6s»), herramientas como líneas compactas (icono, verbo,
  fichero — la semántica de `resumenDeTool.ts`), avisos y bloqueo como líneas de sistema.
- Aprobaciones como modal: pendientes, diff coloreado de `core/diff.ts`, decisiones
  s/N — fail-closed, cerrar el modal es rechazar.
- Sidebar: contexto usado (tokens contra `topeResuelto`, % y origen), modelos por papel,
  ruta del proyecto y rama git, versión, MCP conectados si el puerto los expone (si no,
  la sección no aparece — nada inventado).
- Barra de estado: modelo activo, contexto, ruta.
- Comandos `/…`: los manejadores de hoy se invocan igual y su salida va al transcript.
  `/provider` pide la clave con entrada oculta dentro de la TUI (mismo pacto 0600).

**No entra (v2 o descartado):** temas de usuario, ratón, editar el transcript,
múltiples sesiones, render de imágenes.

## Arquitectura

```
src/cli/tui/
  app.tsx        — raíz Ink: layout transcript | sidebar, montaje y teardown
  store.ts       — estado de presentación puro (actos derivados de eventos), sin React
  pielTui.ts     — implementa Piel: traduce eventos → mutaciones del store
  transcript.tsx — viewport con scroll: markdown, líneas de tool, fases con duración
  aprobarTui.tsx — modal de aprobación con diff coloreado (mismo contrato que aprobar.ts)
  entrada.tsx    — input con borde: historial, Tab con COMANDOS + @ficheros
  sidebar.tsx    — contexto, modelos, ruta, versión
  temaInk.ts     — mapea los tokens semánticos de tema.ts a estilos Ink
```

Reglas duras:

1. **Ink y react viven SOLO en `src/cli/tui/`.** El guardián de `core/imports.test.ts`
   se extiende: ningún fichero fuera de `cli/tui/` importa ink ni react.
2. **`store.ts` es TypeScript puro, testable sin montar React.** Los componentes solo
   pintan; la lógica (cascada, colapso de fases, acordeón de tools) se prueba en el
   store y en reductores puros.
3. **Un solo vocabulario de color.** `temaInk.ts` consume los tokens semánticos de
   `cli/tema.ts` (`exito`, `grave`, `mudo`…) y los traduce a estilos Ink. Paleta
   dark-first con los azules de XOne.

## Flujo de eventos y modos

- `main.ts` decide piel: TTY real → TUI; pipe/CI → stdio; `--no-tui` fuerza stdio con
  TTY; `--tui` fuerza la TUI. El e2e guionizado de pipes queda byte-idéntico (la piel
  stdio no cambia).
- `correrTurno(eventos, pielTui)` es la misma llamada del motor con otra piel. La TUI
  corre Ink en el mismo proceso; cada método de `pielTui` muta el store.
- La aprobación: el evento `pausa` activa el modal `aprobarTui`, que resuelve la MISMA
  promesa del puerto `pedirAprobacion`. Fail-closed: desmontar el modal, Ctrl-C y
  respuesta vacía son rechazo.
- El readline compartido de la consola desaparece en modo TUI: el teclado lo gestiona
  Ink en raw mode. Ctrl-C con input vacío pide confirmación de salida; durante un turno,
  cancela el turno (el abort del motor ya existe). `/salir` desmonta la TUI.

## Errores

- Fallo del entorno (`ErrorDelSimulador`) y errores de turno: bloque `grave` en el
  transcript con el mismo texto que hoy.
- Si la TUI misma revienta: el catch de `main.ts` desmonta Ink y cae al mensaje de error
  de siempre. Nunca un terminal roto.

## Testing

- **Lógica pura** en `store.ts` y el reductor del modal: tests sin React — ahí vive la
  semántica (cascada, colapso, fail-closed).
- **Componentes** con `ink-testing-library`: entrada (completado, historial), modal
  (decisiones → Promise), sidebar (porcentaje solo si hay tope — la regla de
  `core/contextos.ts`).
- **Invariantes intactos**: `npm test` sin clave/conexión/simulador; piel stdio como e2e
  byte-idéntico de pipes; sesión real contra Ollama como verificación final.
- La frontera se verifica: imports de ink/react solo bajo `cli/tui/`.

## Riesgos asumidos

- **Alt-screen y scrollback**: la TUI es dueña del terminal; el scroll del transcript es
  propio (rueda/PgUp-PgDn), no el scrollback del terminal.
- **Resize**: Ink re-pinta; los bordes y el viewport se recalculan en cada frame.
- **La fase más larga del proyecto**: el transcript markdown en Ink y el modal de
  aprobación son las dos piezas caras. El plan las troceará para que cada paso quede
  verde y commiteable.