# La TUI y el panel

Trozo del mapa de la raíz (`CLAUDE.md`), que Claude Code carga al trabajar en esta carpeta.
Mismas reglas que la raíz: mapa e invariantes, y el porqué medido en `docs/DECISIONES.md`.
Ante una discrepancia con el código, **el código manda**.

# La TUI y el panel (terminal)

- **La TUI es una piel Ink de LA MISMA consola**: lazo, estado y ejecutor entran INYECTADOS
  (`cli/tui/correrTui.ts`). Ink corre con `exitOnCtrlC: false`.
- **`cli/tema.ts` es el ÚNICO fichero de producción con escapes ANSI** (`tema.test.ts` lo vigila).
  El filtro del ratón va DELANTE de Ink (`crearStdinSinRaton`).
- **La fila de dos columnas mide `rows - 1`** (`FILA_DE_RESERVA`): a `rows`, Ink borra el terminal
  y repinta el frame completo en cada tecla. El transcript es lo ÚNICO elástico.
- **El panel de avisos** (`cli/panel.ts`) es la ÚNICA excepción al append-only: recinto de 5
  líneas repintado en sitio; **sin TTY no se instala**.
