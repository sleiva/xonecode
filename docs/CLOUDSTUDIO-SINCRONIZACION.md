# CloudStudio: copia local y sincronización

El agente trabaja sobre una **copia local** del proyecto. CloudStudio no se expone
directamente a los cuatro especialistas: así se conserva el backend de ficheros
confinado a la raíz, las aprobaciones de `write_file`/`edit_file` y una traza que no
contiene argumentos MCP ni credenciales.

## Arranque

En una carpeta sin `.xonecode`, xonecode pregunta el modo:

- **Offline**: usa los ficheros locales y guarda `"modo": "offline"` en
  `.xonecode/config.json`.
- **Cloud connected**: debe completar OAuth contra el MCP de CloudStudio antes de
  aceptar el primer turno. Guarda `"modo": "cloud"`, la URL y los scopes en el
  mismo `config.json`. Los tokens OAuth quedan exclusivamente en
  `~/.xonecode/cloudstudio-oauth.json` con permisos privados.

Una carpeta que ya tiene `.xonecode` no vuelve a preguntar. Los proyectos antiguos
sin `modo` se tratan como offline para no cambiar su comportamiento.

## Estado

El flujo está implementado y medido contra el servidor real. Los detalles y los
hallazgos que le dan forma están en
`docs/superpowers/specs/2026-09-03-cloudstudio-copia-local-design.md`. Un resumen de los
invariantes vive también en `CLAUDE.md`, junto a los demás del repo.
