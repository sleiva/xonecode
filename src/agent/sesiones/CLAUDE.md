# Sesiones, hilos y git

Trozo del mapa de la raíz (`CLAUDE.md`), que Claude Code carga al trabajar en esta carpeta.
Mismas reglas que la raíz: mapa e invariantes, y el porqué medido en `docs/DECISIONES.md`.
Ante una discrepancia con el código, **el código manda**.

# Sesiones, hilos y git

- **El hilo SOBREVIVE al proceso** (`agent/sesiones/checkpointer.ts`, `SqliteSaver` en
  `.xonecode/checkpoint.sqlite`): uno por PROYECTO particionado por `thread_id`, y **el
  `thread_id` ES el id de la sesión**. Se crea con el modo puesto ANTES de abrirlo. La consola de
  TERMINAL no lo usa.
- **Una aprobación sin contestar se vuelve a preguntar, pero no sola**: `abrirSesionReal` SALDA las
  llamadas colgadas (`saldarAprobacionesHuerfanas`) con una respuesta sintética.
- **Esto CRECE y no hay poda.** `.xonecode` se saca del índice privado de `instantanea.ts` y
  `sesionGit.ts` (`sacarXonecodeDelIndice`). `/nuevo` en la web abre un hilo huérfano y lo DICE.
- **Cada turno COMMITEA lo que dejó** (`agent/sesiones/gitSync.ts#commitDeTurno`): índice DE
  VERDAD, sin cambios no se commitea, identidad NUESTRA por `-c`, en el `finally` envuelto entero,
  y solo `dentroDelWorkspace`.
- **La basura del SO va a `info/exclude`, NUNCA a `.gitignore`** (`asegurarExclusiones`).
- **La atribución sale de los COMMITS, no de la foto** (`agent/sesiones/sesionGit.ts`): un TRAILER
  con el id de sesión (`CLAVE_DE_SELLO`), **VERIFICADO** entero (no basta el `--grep`). Sin
  commits sellados el respaldo se declara `via: "desde-apertura"`. Los cuatro valores de `via`
  (`git`, `desde-apertura`, `sin-empezar`, `sin-marca`) son cuatro situaciones distintas.
- **Se lista árbol contra árbol**, nunca `git diff <arbol> -- .`, con `--no-renames` y
  `--relative`. `.xonecode/` se excluye **en el DIFF y nunca en el `git add`**.
- La ref de sesión es `refs/xonecode/sesion/<id>` y no un tag.
- **Al borrar la sesión ABIERTA se cierra ANTES de borrar.** Un título vacío se rechaza
  (`renombrarSesion`).
