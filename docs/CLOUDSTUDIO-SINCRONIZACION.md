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

## Flujo objetivo de cloud

1. Autenticar y pedir el catálogo MCP real.
2. Cargar `project_list` como tool de LangChain e invocarla antes de crear la sesión.
   El usuario elige uno de sus resultados. Se persiste en `.xonecode` su identificador
   estable y nombre; nunca el bearer token.
3. Descargar una copia a `.xonecode/cloudstudio/worktree/` y hacer que planner, dev
   y mockup trabajen exclusivamente contra esa copia.
4. Planner analiza y deja memoria; dev modifica la copia local con las aprobaciones
   habituales; mockup genera artefactos locales.
5. Antes de subir, calcular y mostrar un diff remoto. La subida solo ocurre tras una
   aprobación explícita. Al terminar, actualizar el estado de sincronización y la
   memoria dentro de `.xonecode`.

## Límite actual

La conexión ya invoca `project_list`. Aún no se debe adivinar una API de descarga o
subida: sus nombres, esquemas y semántica han de salir del catálogo MCP autenticado.
El siguiente cambio identificará las tools reales de exportación/importación y añadirá
un adaptador CloudStudio probado con un doble offline.
