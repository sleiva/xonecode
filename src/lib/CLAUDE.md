<!-- src/lib/CLAUDE.md -->
# La librería (`xonecode/lib`)

Trozo del mapa de la raíz (`CLAUDE.md`), que Claude Code carga al trabajar en esta carpeta.
Mismas reglas que la raíz: mapa e invariantes, y el porqué medido en `docs/DECISIONES.md`.
Ante una discrepancia con el código, **el código manda**.

- **`src/lib.ts` es CONTRATO**: lo usa otro repo (xonecode-copilot). Cambiar una firma de lo que
  reexporta lo rompe; añadir es libre.
- **`src/lib/` es capa fachada**: puede importar de `agent/`, `cli/` y `web/servidor/`, como `cli/`.
  `agent/` sigue sin importar de aquí.
- **Importar la lib no carga ink ni React** (`src/lib.test.ts`).
- **`ejecutarTareaAutonoma` repite el pegamento de `puertaDeEntrega`** (juez con plazo) porque
  allí es un cierre privado del corredor: si cambias uno, mira el otro. Las reglas de entrega
  son las de `core/entrega.ts`, compartidas.
