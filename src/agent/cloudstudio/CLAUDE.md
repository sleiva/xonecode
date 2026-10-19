# CloudStudio y la sincronización

Trozo del mapa de la raíz (`CLAUDE.md`), que Claude Code carga al trabajar en esta carpeta.
Mismas reglas que la raíz: mapa e invariantes, y el porqué medido en `docs/DECISIONES.md`.
Ante una discrepancia con el código, **el código manda**.

# CloudStudio y la sincronización

`agent/cloudstudio/cloudstudioMcp.ts`, `descarga.ts`, `gitSync.ts`, `subida.ts`,
`core/planDeSubida.ts`.

- **Las tools remotas NO se inyectan en el agente.** Solo `cli/` (y el vestíbulo) llaman a
  `conectarCloudStudio`, `descarga.ts` y `subida.ts`.
- El puerto de callback (**7634**) es fijo porque el IDS registra el `redirect_uri`; el estado
  OAuth va a `~/.xonecode/cloudstudio-oauth.json`, nunca al repo.
- **Abre por NOMBRE y rechaza el id**: `clienteCloudStudio(invocar, nombreDeProyecto)`.
- **La sesión caída llega de DOS formas**: un error de tool (`isError`) y una respuesta CORRECTA
  cuyo texto empieza por «Error: No project is open…». `conSesion` mira el RESULTADO además de la
  excepción, reabre y reintenta con pausa creciente (`PAUSAS_DE_REAPERTURA_MS`).
  `ProviderCloudStudio.invalidateCredentials` tiene que existir.
- **El nombre de la tool de proyectos no se codifica a pelo** (`herramientaDeProyectos`), y la
  respuesta es un mapa bajo «recents» con el id en `pid`. `proyectosDeResultado` se queda con
  `{id, nombre, compartido?}` y NADA MÁS (la respuesta trae el correo del propietario).
- **El estado de «qué hay arriba» no es un fichero nuestro**: es la ref
  `refs/remotes/cloudstudio/<rama>`.
- **Lo que no se pudo bajar, no se puede borrar** (`core/planDeSubida.ts`): el manifiesto de
  `sync.json`.
- **Se sube a la MISMA rama de la que se bajó** (`config.rama`).
- **La rama activa solo se sabe por `studio_get_context`, y esa tool se CAE en el servidor para
  algunos proyectos**: leerla es una CORTESÍA, no una condición de corrección — el
  `cambiarRama(ramaOrigen)` explícito sostiene de qué rama se baja/sube. `ramaActiva.ts` devuelve
  `undefined` en vez de lanzar; `CloudStudioPort.contexto()` sigue LANZANDO.
- **El `switch` de rama CIERRA el proyecto en el servidor** (`action: "closeandopenproject"`), así
  que `cambiarRama` REABRE después del `switch`.
- **La ref se mueve solo por lo SUBIDO Y COMPROBADO**: con fallos o con una selección no la lleva
  a `HEAD` (afirmaría que está arriba lo no elegido); `marcarSubidoParcial` compone
  en un índice PRIVADO el árbol de la ref con las rutas subidas tomadas de `HEAD`, y la ref pasa
  a ese commit —que ya no es antepasado de `HEAD`: nada lo exige, la ref solo se usa en `git
  diff`—.
- **`.xonecode` no sube nunca.**
- **Orden al descargar: extraer → borrar vistas aplanadas → commit de baseline.**
- **Guarda de árbol limpio al SUBIR** (`arbolLimpio`). **Bajar dentro del workspace VACÍA la copia
  y rehace el git** (`gitSync.ts#vaciarCopia`, `ConfirmacionDeBajada`): se pregunta antes con lo
  que se pierde delante; se vacía SOLO con el zip en la mano; `git init` es DESPUÉS de bajar y en
  la propia carpeta (`prepararRepo(…, { propio: true })`).
- **La autorización de la subida es un hueco de política, fail-closed por TIPO**
  (`core/cloudstudio.ts#PoliticaDeAprobacion`).
- **Lo IMPOSIBLE sale del plan y se declara** (`{operaciones, omitidas}`): `chunked` no se usa
  (falla en el servidor; pendiente del lado de CloudStudio) y el borrado es una tool de TEXTO.
- **Nada de TEXTO se da por subido sin COMPROBARLO** (`agent/cloudstudio/subida.ts`,
  `core/verificacionDeSubida.ts`): hay ficheros que se cortan al subir, sin causa encontrada. Cada
  texto se RELEE y se compara normalizando SOLO lo medido (el salto de línea final que Studio
  quita y CRLF → LF); distinto o sin poder releer es un FALLO con cifras, a `sync.log` y al
  diálogo, y ese fichero no avanza la ref. **Los binarios NO se verifican**: Studio no deja
  releerlos, y el modo `chunked` con hash está pendiente del lado del servidor. Tras `cambiarRama`
  y ANTES de tocar un fichero se lee la rama activa: otra rama es error estructural (no se sube
  nada); ilegible o vacía sube con AVISO (`avisoDeRama`), que viaja como dato
  (`ResultadoDeSubida.avisos`) porque el diálogo esconde el recorrido cuando todo subió. De un
  error de Node en un fallo solo viaja su `code`. **Cada texto se lee con la regla de codificación del proyecto**
  (`core/codificacion.ts#decodificarComoTexto`), no como UTF-8: leído así, un `.xne` ISO-8859-15 llegaba a Studio con
  «�» en cada tilde y la relectura, igual de rota, lo daba por bueno; Studio recibe el texto decodificado y lo guarda en
  la codificación que declara su prólogo.
- Dos trampas: `core.quotePath` (omisión `true`) cita en octal rutas con bytes ≥ 0x80
  (`cambiosPendientes` fuerza `false`), y sin `--no-renames` un renombrado deja el origen huérfano
  en Studio.
