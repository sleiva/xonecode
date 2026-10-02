# Editar ficheros desde la pestaña Ficheros

**Fecha:** 02-10-2026 · **Alcance:** consola web (servidor `src/web/` + cliente `apps/web/`) · **Estado:** diseño aprobado, pendiente de plan

## Qué se pide

Hoy la pestaña Ficheros solo LEE: árbol, visor resaltado con shiki, imágenes. Se quiere **editar** un fichero del
proyecto ahí mismo con un editor de verdad, y **ver qué ha cambiado** con marcas en el margen izquierdo, como el
«git gutter» de VS Code.

## Decisiones tomadas con el usuario

- **Editor: CodeMirror 6.** Se valoró Monaco (el de VS Code) y se descartó: pesa varios MB, necesita configurar
  workers para no tirar de un CDN, y trae IntelliSense de TypeScript que a XOne (ES5) no le sirve. CodeMirror se
  empaqueta como una dependencia más, se carga por módulos y se pinta con variables CSS, así que sigue los temas.
- **Guardar es directo**, sin la tarjeta de aprobación: lo teclea la persona, no el agente. Con las guardas de ruta
  de siempre y negado mientras el agente trabaja en ese proyecto.
- **Marcas en el margen** (barra azul = cambiada, verde = nueva, triángulo rojo = borrado), al pulsar una se
  despliega lo de antes con «Deshacer este cambio», y en el árbol `M` para lo cambiado y `●` para lo no guardado.
- **Base de comparación**: un selector con **«Inicio de la sesión»** por omisión (todo lo de esta sesión, agente
  incluido) y **«Último commit»** (lo cambiado desde el último turno).

## Cómo está hoy (lo que el diseño reutiliza)

- Cliente: `Ficheros.tsx` (árbol + visor), `Visor.tsx` (texto con shiki vía `CodeBlock`), el fichero elegido en
  `App.tsx` (`ficheroElegido`). Se pide por el cable `{clase:"fichero", ruta}` y llega `FicheroDelProyecto`
  (`transporte.ts`): `texto?`, `recortado`, `binario`, `codificacion?`, `mime?`, `base64?`, `vista?`, `error?`. Al
  acabar un turno el cliente vuelve a pedir el fichero abierto.
- Servidor: `atenderFichero` (`arranque.ts`) → `leerFicheroDeProyecto` (`agent/grafo/arbolDeProyecto.ts`), que aplica
  `motivoDeRutaInaceptable` (absolutas, `..`, `puedeLeerRuta`: `.env`/`.git`/`.xonecode`), la regla de la vista
  aplanada, y las MISMAS dos comprobaciones sobre el `realpath`. **No existe ninguna ruta de escritura del cliente a
  ficheros del proyecto.**
- Git: `refDeSesion(id)` = `refs/xonecode/sesion/<id>`, la foto del árbol al ABRIR la sesión (`sesionGit.ts`); solo
  existe si la sesión se marcó (`via` distinto de `sin-marca`). `commitDeTurno` barre TODO lo sucio al final de cada
  turno, solo `dentroDelWorkspace`.
- Turno en vuelo: el servidor lo sabe por consola (`turnoEnVuelo`), y ya hay precedente de negar con «espera a que
  termine el turno». Las tareas de fondo escriben en la misma copia.

## Diseño

### 1. Qué se puede editar

Un fichero se puede editar si y solo si llegó como **texto entero en UTF-8**: `texto` presente, `recortado: false`,
`binario: false`, `codificacion` `utf-8` (o ausente), y no es una imagen. Lo demás se sigue viendo como hoy y el
botón no se pinta (un control sin dato detrás no se pinta). **Límites declarados**: un fichero en `latin1` y uno
recortado por `TOPE_DE_FICHERO` son de solo lectura; no se crean ni se borran ficheros desde aquí.

### 2. El editor (cliente)

- **Botón «Editar»** en la cabecera del visor. Al pulsarlo, el visor de shiki se sustituye por el editor; «Cerrar»
  vuelve al visor. El editor se carga en **diferido** (`React.lazy`): quien no edita no paga el peso.
- **CodeMirror 6** con lenguajes oficiales: XML para `.xne`/`.xml`, JavaScript, CSS, Markdown y JSON; el resto como
  texto plano. Deshacer/rehacer, buscar y reemplazar, plegado, números de línea.
- **El tema son variables CSS**, no colores: fondo, texto, selección, cursor y margen de los `--dsw-alias-*`, y el
  resaltado de los `--shiki-token-*`. Así el editor sigue los temas (`src/temas.ts`) sin redefinir nada al cambiar.
  Ningún color literal (lo vigila `Barra.test.tsx`).
- **Los finales de línea se conservan**: si el fichero venía en CRLF, se guarda en CRLF.
- **Guardar**: botón «Guardar» y `Cmd/Ctrl+S`. Mientras hay cambios sin guardar, la cabecera lo dice (`●`) y el
  fichero lleva `●` en el árbol. Cambiar de fichero, cerrar el editor o cambiar de pestaña con cambios sin guardar
  pregunta antes (un diálogo de verdad, no `confirm`).
- **Un fichero que cambia en disco mientras se edita** (llega una versión nueva al acabar un turno): si no hay
  cambios sin guardar, se recarga solo; si los hay, NO se pisan y una banda lo dice con dos salidas —«Recargar» (se
  pierden los míos) o «Seguir con los míos» (guardar después dará conflicto, ver §3).

### 3. Guardar (servidor)

Mensaje nuevo del cable `{clase:"guardarFichero", ruta, texto, huella}` → respuesta
`{clase:"ficheroGuardado", ruta, huella}` o `{clase:"ficheroGuardado", ruta, error}`. La función vive junto a la de
leer: `escribirFicheroDeProyecto(raiz, ruta, texto, huella)` en `agent/grafo/arbolDeProyecto.ts`. En orden:

1. **Las MISMAS guardas que leer**, reutilizadas, no copiadas: `motivoDeRutaInaceptable`, vista aplanada, y las dos
   comprobaciones sobre el `realpath` (texto y ruta resuelta). Además, **el fichero tiene que existir** y ser un
   fichero normal (no un directorio ni un enlace que salga del proyecto).
2. **Nadie trabajando en ese proyecto**: se niega con motivo si alguna consola de esa RAÍZ tiene un turno en vuelo o
   hay una tarea de fondo en marcha en ella. Se comprueba por raíz, no solo la consola del foco.
3. **Concurrencia optimista por huella**: `huella` es el hash del contenido que el cliente cargó (lo calcula el
   servidor al leer y viaja con `FicheroDelProyecto`). Si el disco ya no coincide, se niega con «el fichero cambió
   desde que lo abriste» y no se escribe nada.
4. **Tope**: el texto no puede pasar de `TOPE_DE_FICHERO`.
5. **Escritura atómica** (fichero temporal + renombrado), conservando los permisos del original. La respuesta trae
   la huella nueva.

Un rechazo se DEVUELVE como `error` con motivo legible; nunca viaja una ruta de la máquina (`sinRutas`).

**Cómo entra en git**: igual que cualquier edición a mano. Dentro del workspace, el `commitDeTurno` del siguiente
turno la barre y la sella con la sesión (límite declarado: se atribuye a esa sesión). Fuera del workspace no se
commitea y Revisión la enseña como sin commitear.

### 4. Las marcas del margen

- **La base** se pide aparte: `{clase:"baseDeFichero", ruta, base: "sesion" | "commit"}` →
  `{clase:"baseDeFichero", ruta, base, texto}` o `{…, vacio: true}` (el fichero no existía en esa base: todo es
  nuevo) o `{…, sinBase: motivo}`. «sesion» es `git show refs/xonecode/sesion/<id>:<ruta>`; «commit» es
  `git show HEAD:<ruta>`. Las mismas guardas de ruta que leer. Sin git, sin la ref de sesión (`sin-marca`) o fuera de
  un repo: `sinBase` con el motivo, y el editor funciona igual **sin marcas**, diciendo por qué en la barra de abajo.
- **El cálculo** de trozos cambiados lo hace el motor de diff oficial de CodeMirror (`@codemirror/merge`), sobre la
  base y el texto ACTUAL del editor, así que las marcas se mueven mientras se teclea. La traducción de trozos a
  marcas (cambiada / nueva / borrado) es una función PURA con test.
- **El margen**: barra azul para líneas cambiadas, verde para nuevas, triángulo rojo entre líneas donde se borró
  algo. Colores de alias de estado (`--dsw-alias-state-*`), así que siguen los temas.
- **Pulsar una marca** despliega debajo lo de antes en ese trozo, con **«Deshacer este cambio»**, que devuelve SOLO
  ese trozo al texto de la base (es una edición más: se deshace con `Cmd/Ctrl+Z` y hay que guardar).
- **La barra de abajo** cuenta «N cambiadas · N nuevas · N borradas» y tiene el selector de base, por omisión
  «Inicio de la sesión». La base se vuelve a pedir tras guardar y al acabar un turno.
- **El árbol**: `M` junto a los ficheros que cambiaron en la sesión, sacado de la MISMA lista que ya calcula
  Revisión (`cambiosDeSesion`), y `●` en el que tiene cambios sin guardar.

### 5. Límites declarados

- Solo UTF-8 entero; `latin1` y recortados, de solo lectura. Ni crear, ni borrar, ni renombrar.
- La edición manual se atribuye en git a la sesión cuyo turno siguiente la commitea.
- Sin marcas cuando no hay base (sin git, sin ref de sesión, fuera de un repo); se dice.
- Guardar no se pone en la cola de escrituras del agente (`escriturasEnSerie`): no hace falta mientras se niegue con
  un turno o una tarea en marcha, que son los únicos que escriben ahí.
- Por un túnel funciona igual: es todo por el cable.

### 6. Tests

- **Servidor** (`arbolDeProyecto.test.ts` y el handler): guarda y escribe; niega `.env`, `.git/…`, `.xonecode/…`,
  una vista aplanada, `..`, una ruta absoluta, un enlace que sale del proyecto, un fichero que no existe, un texto
  por encima del tope; niega con huella vieja sin tocar el disco; niega con un turno en vuelo en esa raíz; conserva
  CRLF y permisos; el error no lleva ruta de la máquina.
- **Base**: `sesion` y `commit` contra un repo temporal de verdad; `vacio` para un fichero nuevo; `sinBase` sin git
  y sin ref.
- **Puro**: de trozos del diff a marcas (cambiada / nueva / borrado), con casos de borde (borrado al final, todo
  nuevo, sin cambios).
- **Cliente**: «Editar» solo se pinta para texto UTF-8 entero; `●` con cambios; guardar manda `guardarFichero` con
  la huella; cambiar de fichero con cambios pregunta; una versión nueva del fichero con cambios sin guardar NO los
  pisa y saca la banda; sin base no hay marcas y lo dice.
- **Frontera**: el editor no se importa fuera de su componente diferido; `Barra.test.tsx` y
  `estilosDelCliente.test.ts` siguen en verde (sin literales, alias existentes).
- **Navegador**: editar un `.xne`, ver las marcas contra el inicio de la sesión, deshacer un trozo, guardar, y que
  el siguiente turno lo commitee; con un tema claro y uno oscuro.
